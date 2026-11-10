import { randomUUID } from 'node:crypto';
import type { Content, FunctionDeclaration, GenerateContentResponse, Part } from '@google/genai';

/**
 * Traducción entre el formato que usa el navegador (mensajes con bloques `text`,
 * `tool_use` y `tool_result`) y el de la API de Gemini (`contents` con `parts`).
 *
 * El turno del modelo se devuelve al navegador con un bloque `gemini_content` que guarda
 * las `parts` originales tal cual llegaron. En la siguiente vuelta se reenvían sin tocar:
 * así se conservan las firmas de razonamiento (`thoughtSignature`), que Gemini 3 y 4
 * exigen en las llamadas a funciones.
 */

type Block = { type?: unknown } & Record<string, unknown>;

export interface ClientMessage {
  role: 'user' | 'assistant';
  content: string | Block[];
}

export interface ClientTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Respuesta para el navegador, con la misma forma que espera `BackendProvider`. */
export interface ClientResponse {
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal';
  content: Block[];
  model?: string;
}

export class FormatError extends Error {}

/** Motivos de parada que significan que Gemini ha bloqueado la petición o la respuesta. */
const BLOCKED = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
  'IMAGE_SAFETY',
]);
/** Motivos de parada en los que el modelo generó una llamada a función inválida. */
const MALFORMED = new Set(['MALFORMED_FUNCTION_CALL', 'UNEXPECTED_TOOL_CALL']);

export function toFunctionDeclarations(tools: ClientTool[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    // JSON Schema estándar (con enum, minimum/maximum y additionalProperties).
    parametersJsonSchema: withoutPatterns(tool.input_schema),
  }));
}

/**
 * Quita las expresiones regulares (`pattern`) del esquema: no está claro que Gemini las
 * admita, y no hacen falta porque `runTool` valida cada argumento con Zod de todos modos.
 */
function withoutPatterns(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutPatterns);
  if (typeof schema !== 'object' || schema === null) return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key, value]) => !(key === 'pattern' && typeof value === 'string'))
      .map(([key, value]) => [key, withoutPatterns(value)]),
  );
}

function parseToolOutput(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Firma comodín que documenta Google para reenviar turnos generados por OTRO modelo: las
 * firmas reales solo valen para el modelo que las creó.
 */
export const SKIP_SIGNATURE = 'skip_thought_signature_validator';

function originalTurn(content: Block[]): { parts: Part[]; model?: string } | null {
  const block = content.find((b) => b.type === 'gemini_content');
  if (!block || !Array.isArray(block.parts)) return null;
  return {
    parts: block.parts as Part[],
    model: typeof block.model === 'string' ? block.model : undefined,
  };
}

/** Modelo que generó el último turno del asistente (para seguir con él en el mismo turno). */
export function lastModelUsed(messages: ClientMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === 'assistant' && Array.isArray(msg.content)) {
      const turn = originalTurn(msg.content);
      if (turn?.model) return turn.model;
    }
  }
  return undefined;
}

/**
 * Convierte el historial del navegador en `contents` de Gemini para `targetModel`.
 * Los turnos de ese mismo modelo se reenvían intactos; los de otro modelo (tras un cambio
 * por saturación) llevan la firma comodín en lugar de la suya.
 */
export function toGeminiContents(messages: ClientMessage[], targetModel?: string): Content[] {
  // id de cada tool_use → nombre de la función e id original de Gemini (si lo tenía).
  const calls = new Map<string, { name: string; geminiId?: string }>();

  return messages.map((msg): Content => {
    if (msg.role !== 'user' && msg.role !== 'assistant') throw new FormatError('bad_role');
    const role = msg.role === 'assistant' ? 'model' : 'user';
    if (typeof msg.content === 'string') return { role, parts: [{ text: msg.content }] };
    if (!Array.isArray(msg.content)) throw new FormatError('bad_content');

    if (msg.role === 'assistant') {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && typeof block.id === 'string') {
          calls.set(block.id, {
            name: String(block.name),
            geminiId: typeof block.gemini_id === 'string' ? block.gemini_id : undefined,
          });
        }
      }
      // Lo normal: reenviar las parts originales del modelo, sin modificar.
      const original = originalTurn(msg.content);
      if (original) {
        const foreign = !!targetModel && !!original.model && original.model !== targetModel;
        const parts = foreign
          ? original.parts.map((p) =>
              p.thoughtSignature ? { ...p, thoughtSignature: SKIP_SIGNATURE } : p,
            )
          : original.parts;
        return { role, parts };
      }
      const parts: Part[] = [];
      for (const block of msg.content) {
        if (block.type === 'text' && typeof block.text === 'string')
          parts.push({ text: block.text });
        if (block.type === 'tool_use') {
          parts.push({
            functionCall: {
              name: String(block.name),
              args: (block.input as Record<string, unknown>) ?? {},
              ...(typeof block.gemini_id === 'string' ? { id: block.gemini_id } : {}),
            },
          });
        }
      }
      return { role, parts };
    }

    // Turno del usuario: texto y/o resultados de funciones (todos juntos, en orden).
    const parts: Part[] = [];
    for (const block of msg.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        parts.push({ text: block.text });
      } else if (block.type === 'tool_result') {
        const call = calls.get(String(block.tool_use_id));
        if (!call) throw new FormatError('unknown_tool_use_id');
        const output = parseToolOutput(block.content);
        parts.push({
          functionResponse: {
            name: call.name,
            ...(call.geminiId ? { id: call.geminiId } : {}),
            response: block.is_error ? { error: output } : { result: output },
          },
        });
      }
    }
    if (parts.length === 0) throw new FormatError('empty_message');
    return { role, parts };
  });
}

export type GeminiResult =
  { ok: true; response: ClientResponse } | { ok: false; error: string; message: string };

/** Convierte la respuesta de Gemini (generada por `requested`) al formato del navegador. */
export function fromGeminiResponse(
  response: Pick<GenerateContentResponse, 'candidates' | 'promptFeedback' | 'modelVersion'>,
  requested?: string,
): GeminiResult {
  const model = requested ?? response.modelVersion;
  if (response.promptFeedback?.blockReason) {
    return { ok: true, response: { stop_reason: 'refusal', content: [], model } };
  }
  const candidate = response.candidates?.[0];
  if (!candidate) {
    return { ok: false, error: 'empty_response', message: 'Gemini no ha devuelto respuesta' };
  }
  const finish = String(candidate.finishReason ?? 'STOP');
  if (BLOCKED.has(finish)) {
    return { ok: true, response: { stop_reason: 'refusal', content: [], model } };
  }
  if (MALFORMED.has(finish)) {
    return {
      ok: false,
      error: 'malformed_function_call',
      message: 'Gemini ha generado una llamada a función inválida',
    };
  }

  const parts = candidate.content?.parts ?? [];
  const content: Block[] = [];
  const turn = randomUUID().slice(0, 8);
  let calls = 0;
  for (const part of parts) {
    if (part.functionCall?.name) {
      calls += 1;
      content.push({
        type: 'tool_use',
        // La API de Gemini no siempre da un id: se genera uno único para el navegador.
        id: part.functionCall.id ?? `gemini-${turn}-${calls}`,
        name: part.functionCall.name,
        input: part.functionCall.args ?? {},
        ...(part.functionCall.id ? { gemini_id: part.functionCall.id } : {}),
      });
    } else if (typeof part.text === 'string' && !part.thought) {
      content.push({ type: 'text', text: part.text });
    }
  }
  content.push({ type: 'gemini_content', parts, ...(model ? { model } : {}) });

  const stop_reason = calls > 0 ? 'tool_use' : finish === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
  return { ok: true, response: { stop_reason, content, model } };
}
