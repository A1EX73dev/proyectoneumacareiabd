import type { z } from 'zod';
import type { AppStore } from '../state';
import type { PriorityLevel, Range, ToolResult, ToolSource } from '../types';

/** env: mueve actuadores (sujeta a prioridades); admin: datos/agenda; info: lectura o aviso. */
export type ToolKind = 'env' | 'admin' | 'info';

export interface ToolContext {
  store: AppStore;
  priority: PriorityLevel;
  source: ToolSource;
  reason: string;
  eventId: string;
  nowMin: number;
}

/**
 * Definición única de una función del agente. A partir de aquí se derivan:
 * validación (Zod), recorte de rangos, JSON Schema para el LLM y ejecución.
 */
export interface ToolSpec<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  kind: ToolKind;
  schema: S;
  /** Rangos numéricos de argumentos de primer nivel: se recortan y se publican como minimum/maximum. */
  ranges?: Readonly<Record<string, Range>>;
  execute(args: z.infer<S>, ctx: ToolContext): ToolResult;
}

export function defineTool<S extends z.ZodTypeAny>(spec: ToolSpec<S>): ToolSpec<S> {
  return spec;
}

export const ok = (result: unknown): ToolResult => ({ ok: true, result });
export const fail = (error: string): ToolResult => ({ ok: false, error });
