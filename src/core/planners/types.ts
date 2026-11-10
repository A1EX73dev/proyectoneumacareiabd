import type { AppState } from '../state';
import type { AgentEvent, PlannerKind, ToolCall, ToolResult } from '../types';

/** Todo lo que un planner necesita para decidir: el evento y una foto del estado. */
export interface AgentContext {
  event: AgentEvent;
  state: AppState;
  nowMin: number;
}

/** Contrato enchufable del motor local: evento → lista de llamadas, sin ejecutar nada. */
export interface Planner {
  readonly kind: PlannerKind;
  plan(ctx: AgentContext): Promise<ToolCall[]>;
}

/** Ejecuta una llamada (en la aplicación, `runTool`) y devuelve su resultado. */
export type ToolExecutor = (call: ToolCall) => ToolResult;

/** Resultado de un turno del agente de IA: lo que ha ejecutado y lo que responde. */
export interface AgentTurn {
  calls: ToolCall[];
  results: ToolResult[];
  /** Respuesta final del modelo para el usuario (null si no ha dado ninguna). */
  reply: string | null;
  /** Fallo ocurrido después de haber ejecutado ya alguna función (el turno queda a medias). */
  error?: Error;
}

/**
 * Contrato del agente de IA: a diferencia de `Planner`, ejecuta las funciones sobre la
 * marcha y ve sus resultados antes de seguir. Lanza solo si falla sin haber ejecutado nada,
 * para que el agente pueda caer al motor local sin duplicar acciones.
 */
export interface ConversationalPlanner {
  readonly kind: PlannerKind;
  converse(ctx: AgentContext, exec: ToolExecutor): Promise<AgentTurn>;
}
