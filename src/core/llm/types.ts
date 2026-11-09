import type { ToolDef } from '../tools';
import type { ToolCall } from '../types';

export type { ToolDef };

export interface Msg {
  role: 'user' | 'assistant';
  content: string;
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
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
