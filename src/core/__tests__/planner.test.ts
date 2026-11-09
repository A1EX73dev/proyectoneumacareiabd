import { describe, expect, it } from 'vitest';
import { makeEvent, planWithFallback } from '../agent';
import { AnthropicProvider, LlmNotConfiguredError, ScriptedProvider } from '../llm';
import { LlmPlanner, MockPlanner, type Planner } from '../planners';
import { setPlannerKind } from '../state';
import { PRIORITY } from '../types';
import { testAgent, testStore } from './helpers';

function llmStore() {
  const store = testStore();
  store.setState((s) => setPlannerKind(s, 'llm'));
  return store;
}

describe('planner enchufable y caída al MockPlanner', () => {
  it('AnthropicProvider es un stub: rechaza con un error claro y sin red', async () => {
    const provider = new AnthropicProvider();
    await expect(provider.complete({ system: '', messages: [], tools: [] })).rejects.toBeInstanceOf(
      LlmNotConfiguredError,
    );
  });

  it('si el LLM no está configurado, el agente cae al Mock y lo registra', async () => {
    const store = llmStore();
    const agent = testAgent(store);
    const run = await agent.handle(
      makeEvent('voice', { text: 'pon el protocolo de calma en la 202' }, 0),
    );
    expect(run.fellBack).toBe(true);
    expect(run.planner).toBe('mock');
    expect(store.getState().rooms['202']?.protocol).toBe('calma');
    expect(store.getState().agent.fallbacks).toBe(1);
    expect(store.getState().agent.calls.some((c) => c.call.name === 'planner_fallback')).toBe(true);
  });

  it('si el LLM devuelve una llamada inválida, se descarta todo su plan y se usa el Mock', async () => {
    const store = llmStore();
    const provider = new ScriptedProvider(() => ({
      toolCalls: [
        { id: 'a', name: 'set_light', args: { room: '202', pct: 10 } },
        { id: 'b', name: 'set_temperature', args: { room: '202', value: 'muy alta' } },
      ],
    }));
    const agent = testAgent(store, new LlmPlanner(provider));
    const run = await agent.handle(
      makeEvent('voice', { text: 'sube la temperatura a 23 en la 202' }, 0),
    );
    expect(run.fellBack).toBe(true);
    expect(store.getState().rooms['202']?.target?.tempC).toBe(23);
    expect(store.getState().rooms['202']?.target?.lightPct).not.toBe(10);
  });

  it('con una respuesta válida, el LLM actúa vía runTool con la prioridad del evento (no la suya)', async () => {
    const store = llmStore();
    const provider = new ScriptedProvider(() => ({
      text: 'Subo la luz',
      toolCalls: [{ id: 'a', name: 'set_light', args: { room: '202', pct: 60 } }],
    }));
    const agent = testAgent(store, new LlmPlanner(provider));
    const run = await agent.handle(makeEvent('voice', { text: 'más luz en la 202' }, 0));
    expect(run.fellBack).toBe(false);
    expect(run.planner).toBe('llm');
    expect(run.calls[0]?.priority).toBe(PRIORITY.MANUAL);
    expect(run.calls[0]?.source).toBe('llm');
    expect(store.getState().rooms['202']?.target?.lightPct).toBe(60);
    // El proveedor recibe las herramientas en JSON Schema y el prompt del sistema.
    expect(provider.lastRequest?.tools.length).toBeGreaterThan(10);
    expect(provider.lastRequest?.system).toMatch(/prioridades/);
  });

  it('los eventos de seguridad nunca se delegan al LLM', async () => {
    const provider = new ScriptedProvider(() => ({ toolCalls: [] }));
    const planner = new LlmPlanner(provider);
    const store = testStore();
    const event = makeEvent('manual', { action: 'simulateAlarm', room: '202' }, 0);
    await expect(planner.plan({ event, state: store.getState(), nowMin: 0 })).rejects.toThrow();
    expect(provider.lastRequest).toBeNull();
  });

  it('planWithFallback usa el respaldo solo cuando el principal falla', async () => {
    const store = testStore();
    const event = makeEvent('voice', { text: 'avisa a enfermería en la 202' }, 0);
    const ctx = { event, state: store.getState(), nowMin: 0 };
    const failing: Planner = { kind: 'llm', plan: () => Promise.reject(new Error('caído')) };
    const errors: string[] = [];
    const out = await planWithFallback(failing, new MockPlanner(), ctx, (e) =>
      errors.push(e.message),
    );
    expect(out.fellBack).toBe(true);
    expect(errors).toEqual(['caído']);
    expect(out.calls[0]?.name).toBe('notify_staff');

    const ok = await planWithFallback(new MockPlanner(), failing, ctx, () => undefined);
    expect(ok.fellBack).toBe(false);
  });

  it('parseMessagesResponse convierte bloques tool_use en ToolCall', () => {
    const parsed = AnthropicProvider.parseMessagesResponse({
      content: [
        { type: 'text', text: 'Bajo la luz.' },
        { type: 'tool_use', id: 'toolu_1', name: 'set_light', input: { room: '201', pct: 20 } },
      ],
    });
    expect(parsed.text).toBe('Bajo la luz.');
    expect(parsed.toolCalls).toEqual([
      { id: 'toolu_1', name: 'set_light', args: { room: '201', pct: 20 } },
    ]);
  });
});
