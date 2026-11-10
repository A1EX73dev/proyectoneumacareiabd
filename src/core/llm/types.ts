import type { ToolDef } from '../tools';
import type { ToolCall } from '../types';

export type { ToolDef };

/**
 * Bloque de contenido de un mensaje (`text`, `tool_use`, `tool_result`, `thinking`…).
 * El núcleo lo trata como opaco: los turnos del asistente se reenvían tal cual llegaron.
 */
export type ContentBlock = { type: string } & Record<string, unknown>;

export interface Msg {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface LlmRequest {
  system: string;
  messages: Msg[];
  tools: ToolDef[];
}

/** Llamada propuesta por el LLM (sin prioridad: esa la decide el planner a partir del evento). */
export type LlmToolCall = Pick<ToolCall, 'id' | 'name' | 'args'>;

export interface LlmResponse {
  toolCalls: LlmToolCall[];
  text?: string;
  /** Contenido original del turno del asistente, para devolverlo sin modificar en el bucle. */
  content?: ContentBlock[];
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
