import { createAgent, type Agent } from '../agent';
import { BackendProvider } from '../llm';
import { LlmPlanner, MockPlanner, type ConversationalPlanner } from '../planners';
import {
  createAppStore,
  createInitialState,
  type AppStore,
  type InitialStateOptions,
} from '../state';
import { MIN_PER_DAY, parseHHmm } from '../time';
import { PRIORITY, type PriorityLevel, type ToolCall, type Trigger } from '../types';

let n = 0;

/** Minutos absolutos de un día y hora. */
export const at = (hhmm: string, day = 0): number => day * MIN_PER_DAY + parseHHmm(hhmm);

export function testStore(opts: InitialStateOptions = {}): AppStore {
  return createAppStore(createInitialState({ seedPatients: true, triggers: [], ...opts }));
}

export function testAgent(store: AppStore, llm?: ConversationalPlanner): Agent {
  return createAgent({
    store,
    mock: new MockPlanner(),
    llm: llm ?? new LlmPlanner(new BackendProvider()),
  });
}

export function call(
  name: string,
  args: Record<string, unknown>,
  priority: PriorityLevel = PRIORITY.MANUAL,
  extra: Partial<ToolCall> = {},
): ToolCall {
  n += 1;
  return { id: `test-${n}`, name, args, priority, source: 'manual', ...extra };
}

export function trigger(partial: Partial<Trigger> & Pick<Trigger, 'type' | 'time'>): Trigger {
  n += 1;
  return {
    id: `trg-test-${n}`,
    roomId: 'all',
    repeat: 'daily',
    durationMin: 30,
    enabled: true,
    params: {},
    lastFiredKey: null,
    ...partial,
  };
}
