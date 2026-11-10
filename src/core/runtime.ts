import { createAgent } from './agent';
import { BackendProvider } from './llm';
import { LlmPlanner, MockPlanner } from './planners';
import { createEngine } from './scheduler';
import { appStore } from './state';

/** Backend propio que guarda la API key (ver server/agentProxy.ts y docs/LLM.md). */
export const LLM_ENDPOINT = '/api/agent';

/** Instancias únicas que usa la aplicación (los tests crean las suyas). */
export const mockPlanner = new MockPlanner();
export const llmPlanner = new LlmPlanner(new BackendProvider({ endpoint: LLM_ENDPOINT }));

export const agent = createAgent({ store: appStore, mock: mockPlanner, llm: llmPlanner });
export const engine = createEngine({ store: appStore, agent });
