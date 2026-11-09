import { createAgent } from './agent';
import { AnthropicProvider } from './llm';
import { LlmPlanner, MockPlanner } from './planners';
import { createEngine } from './scheduler';
import { appStore } from './state';

/** Instancias únicas que usa la aplicación (los tests crean las suyas). */
export const mockPlanner = new MockPlanner();
export const llmPlanner = new LlmPlanner(new AnthropicProvider());

export const agent = createAgent({ store: appStore, mock: mockPlanner, llm: llmPlanner });
export const engine = createEngine({ store: appStore, agent });

/** El LLM está deshabilitado en esta fase ("próximamente"). */
export const LLM_AVAILABLE = false;
