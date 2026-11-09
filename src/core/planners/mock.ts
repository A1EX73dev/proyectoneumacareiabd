import { planForEvent } from '../policy/engine';
import type { ToolCall } from '../types';
import type { AgentContext, Planner } from './types';

/** Planner por defecto: el motor de políticas determinista (sin red, explicable). */
export class MockPlanner implements Planner {
  readonly kind = 'mock' as const;

  plan(ctx: AgentContext): Promise<ToolCall[]> {
    return Promise.resolve(planForEvent({ event: ctx.event, state: ctx.state }));
  }
}
