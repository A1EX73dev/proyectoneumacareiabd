import type { AppState } from '../state';
import type { AgentEvent, PlannerKind, ToolCall } from '../types';

/** Todo lo que un planner necesita para decidir: el evento y una foto del estado. */
export interface AgentContext {
  event: AgentEvent;
  state: AppState;
  nowMin: number;
}

/** Contrato enchufable: el agente no sabe si decide un motor de reglas o un LLM. */
export interface Planner {
  readonly kind: PlannerKind;
  plan(ctx: AgentContext): Promise<ToolCall[]>;
}
