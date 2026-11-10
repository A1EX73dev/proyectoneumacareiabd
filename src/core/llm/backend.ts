import { t } from '../../i18n';
import type { ContentBlock, LlmProvider, LlmRequest, LlmResponse, LlmToolCall } from './types';

export class LlmNotConfiguredError extends Error {
  constructor() {
    super(t('llm.notConfigured'));
    this.name = 'LlmNotConfiguredError';
  }
}

/** El backend del agente no está, ha fallado o el modelo no ha dado una respuesta utilizable. */
export class LlmBackendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmBackendError';
  }
}

export interface BackendProviderOptions {
  /**
   * URL de TU backend (p. ej. `/api/agent`, ver `server/agentProxy.ts`) que guarda la API key
   * y habla con el modelo (Gemini). Nunca se debe poner la clave en el cliente.
   */
  endpoint?: string;
  /** Máximo de espera por respuesta, en milisegundos. */
  timeoutMs?: number;
  /** Punto de inyección para pruebas. */
  fetch?: typeof fetch;
}

/**
 * Proveedor del modelo a través de un backend propio. El navegador nunca habla con el
 * proveedor del modelo ni conoce la API key. Sin `endpoint`, rechaza sin tocar la red.
 *
 * Formato con el backend: el navegador envía `{ system, messages, tools }` y recibe
 * `{ stop_reason, content }`, con bloques `text` y `tool_use`. Los demás bloques (como
 * `gemini_content`) son opacos y se devuelven tal cual en la siguiente vuelta.
 */
export class BackendProvider implements LlmProvider {
  readonly name = 'backend';

  constructor(readonly options: BackendProviderOptions = {}) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const { endpoint, timeoutMs = 60_000 } = this.options;
    if (!endpoint) throw new LlmNotConfiguredError();
    const doFetch = this.options.fetch ?? fetch;

    let res: Response;
    try {
      res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new LlmBackendError(t('llm.unreachable'));
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const info = (body ?? {}) as { error?: unknown; message?: unknown };
      const detail = [info.error, info.message]
        .filter((x) => typeof x === 'string')
        .join(': ')
        .replace(/[.\s]+$/, '');
      throw new LlmBackendError(
        t('llm.backendError', { status: res.status, detail: detail || res.statusText || '—' }),
        res.status,
      );
    }

    // Antes de leer el contenido hay que mirar por qué paró el modelo.
    const stopReason = (body as { stop_reason?: unknown } | null)?.stop_reason;
    if (stopReason === 'refusal') throw new LlmBackendError(t('llm.refused'));
    if (stopReason === 'max_tokens') throw new LlmBackendError(t('llm.truncated'));
    return BackendProvider.parseResponse(body);
  }

  /**
   * Convierte la respuesta del backend (bloques `text` y `tool_use`) en `LlmResponse`.
   * Conserva el `content` original para poder reenviarlo sin tocar.
   */
  static parseResponse(body: unknown): LlmResponse {
    const content = (body as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) return { toolCalls: [] };
    const toolCalls: LlmToolCall[] = [];
    const texts: string[] = [];
    for (const block of content as ContentBlock[]) {
      if (block.type === 'tool_use' && typeof block.name === 'string') {
        toolCalls.push({
          id: typeof block.id === 'string' ? block.id : `tu-${toolCalls.length}`,
          name: block.name,
          args: (block.input as Record<string, unknown>) ?? {},
        });
      } else if (block.type === 'text' && typeof block.text === 'string') {
        texts.push(block.text);
      }
    }
    return {
      toolCalls,
      text: texts.join('\n').trim() || undefined,
      content: content as ContentBlock[],
    };
  }
}
