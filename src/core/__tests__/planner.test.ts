import { describe, expect, it } from 'vitest';
import { makeEvent } from '../agent';
import {
  BackendProvider,
  LlmBackendError,
  LlmNotConfiguredError,
  ScriptedProvider,
  type ContentBlock,
  type LlmRequest,
  type LlmResponse,
} from '../llm';
import { LLM_EXCLUDED_TOOLS, LlmPlanner, MAX_AGENT_STEPS } from '../planners';
import { setPlannerKind } from '../state';
import { runTool } from '../tools';
import { PRIORITY } from '../types';
import { testAgent, testStore } from './helpers';

function llmStore() {
  const store = testStore();
  store.setState((s) => setPlannerKind(s, 'llm'));
  return store;
}

/** Proveedor guionizado: una respuesta por vuelta, y guarda una copia de cada petición. */
function scripted(steps: LlmResponse[]) {
  const requests: LlmRequest[] = [];
  const provider = new ScriptedProvider((req) => {
    requests.push(structuredClone(req));
    const next = steps[requests.length - 1];
    if (!next) throw new Error('sin más respuestas guionizadas');
    return next;
  });
  return { provider, requests };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('agente de IA y caída al motor local', () => {
  it('sin endpoint, BackendProvider rechaza con un error claro y sin red', async () => {
    const provider = new BackendProvider();
    await expect(provider.complete({ system: '', messages: [], tools: [] })).rejects.toBeInstanceOf(
      LlmNotConfiguredError,
    );
  });

  it('si el agente de IA no está disponible, responde el motor local y queda registrado', async () => {
    const store = llmStore();
    const agent = testAgent(store);
    const run = await agent.handle(
      makeEvent('voice', { text: 'pon el protocolo de calma en la 202' }, 0),
    );
    expect(run.fellBack).toBe(true);
    expect(run.planner).toBe('mock');
    expect(store.getState().rooms['202']?.protocol).toBe('calma');
    expect(store.getState().agent.fallbacks).toBe(1);
    expect(store.getState().agent.llmError).toBeTruthy();
    expect(store.getState().agent.pending).toBe(0);
    expect(store.getState().agent.calls.some((c) => c.call.name === 'planner_fallback')).toBe(true);
  });

  it('ejecuta las funciones vía runTool con la prioridad del evento y responde con el texto final', async () => {
    const store = llmStore();
    const { provider, requests } = scripted([
      { toolCalls: [{ id: 'a', name: 'set_light', args: { room: '202', pct: 60 } }] },
      { toolCalls: [], text: 'Luz de la 202 al 60 %.' },
    ]);
    const agent = testAgent(store, new LlmPlanner(provider));
    const run = await agent.handle(makeEvent('voice', { text: 'más luz en la 202' }, 0));

    expect(run.fellBack).toBe(false);
    expect(run.planner).toBe('llm');
    expect(run.calls[0]?.priority).toBe(PRIORITY.MANUAL);
    expect(run.calls[0]?.source).toBe('llm');
    expect(run.reply).toBe('Luz de la 202 al 60 %.');
    expect(store.getState().rooms['202']?.target?.lightPct).toBe(60);
    // Una orden manual atendida por la IA también desactiva el Modo IA de la sala.
    expect(store.getState().rooms['202']?.auto).toBe(false);
    const conversation = store.getState().agent.conversation;
    expect(conversation.map((c) => c.who)).toEqual(['user', 'agent']);
    expect(conversation[1]?.text).toBe('Luz de la 202 al 60 %.');

    // Primera petición: prompt del sistema, herramientas y la orden con su contexto.
    expect(requests[0]?.system).toMatch(/prioridades/);
    expect(requests[0]?.tools.length).toBeGreaterThan(10);
    const first = JSON.parse(String(requests[0]?.messages[0]?.content)) as {
      orden: string;
      contexto: { habitaciones: unknown[]; conversacionReciente: unknown[] };
    };
    expect(first.orden).toBe('más luz en la 202');
    expect(first.contexto.habitaciones).toHaveLength(10);
    expect(first.contexto.conversacionReciente).toEqual([]);

    // Segunda petición: el turno del asistente y el resultado de la función, sin tocar lo anterior.
    expect(requests[1]?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(requests[1]?.messages[0]).toEqual(requests[0]?.messages[0]);
    const results = requests[1]?.messages[2]?.content as ContentBlock[];
    expect(results[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'a', is_error: false });
  });

  it('una llamada inválida no se ejecuta: vuelve al modelo como error para que corrija', async () => {
    const store = llmStore();
    const { provider, requests } = scripted([
      {
        toolCalls: [
          { id: 'a', name: 'set_light', args: { room: '202', pct: 10 } },
          { id: 'b', name: 'set_temperature', args: { room: '202', value: 'muy alta' } },
        ],
      },
      { toolCalls: [{ id: 'c', name: 'set_temperature', args: { room: '202', value: 23 } }] },
      { toolCalls: [], text: 'Hecho.' },
    ]);
    const agent = testAgent(store, new LlmPlanner(provider));
    const run = await agent.handle(
      makeEvent('voice', { text: 'baja la luz y sube la temperatura a 23 en la 202' }, 0),
    );

    expect(run.fellBack).toBe(false);
    expect(run.results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(store.getState().rooms['202']?.target?.lightPct).toBe(10);
    expect(store.getState().rooms['202']?.target?.tempC).toBe(23);
    // Los dos resultados del primer turno vuelven juntos, en un solo mensaje.
    const results = requests[1]?.messages[2]?.content as ContentBlock[];
    expect(results.map((r) => r.is_error)).toEqual([false, true]);
  });

  it('el modelo no recibe ni puede ejecutar las funciones de datos del paciente', async () => {
    const store = llmStore();
    const { provider, requests } = scripted([
      { toolCalls: [{ id: 'a', name: 'clear_patient', args: { room: '201' } }] },
      { toolCalls: [], text: 'No puedo borrar datos de pacientes.' },
    ]);
    const agent = testAgent(store, new LlmPlanner(provider));
    const run = await agent.handle(makeEvent('voice', { text: 'borra el paciente de la 201' }, 0));

    const offered = requests[0]?.tools.map((tool) => tool.name) ?? [];
    for (const name of LLM_EXCLUDED_TOOLS) expect(offered).not.toContain(name);
    expect(run.results[0]?.ok).toBe(false);
    expect(store.getState().rooms['201']?.patientForm).not.toBeNull();
  });

  it('el contexto no incluye datos clínicos y sí la conversación anterior', async () => {
    const store = llmStore();
    const { provider, requests } = scripted([
      { toolCalls: [], text: '¿En qué habitación?' },
      { toolCalls: [], text: 'Vale.' },
    ]);
    const agent = testAgent(store, new LlmPlanner(provider));
    await agent.handle(makeEvent('voice', { text: 'baja la luz' }, 0));
    await agent.handle(makeEvent('voice', { text: 'en la 201' }, 0));

    const second = String(requests[1]?.messages[0]?.content);
    const parsed = JSON.parse(second) as { contexto: { conversacionReciente: unknown[] } };
    expect(parsed.contexto.conversacionReciente).toEqual([
      { quien: 'usuario', texto: 'baja la luz' },
      { quien: 'asistente', texto: '¿En qué habitación?' },
    ]);
    expect(second).not.toMatch(
      /patientForm|anxiety|admissionReason|deliriumRisk|aromaAllergy|bedRestriction/,
    );
    // De la cama solo viaja el ángulo y el rango permitido.
    expect(second).toMatch(/"cama":\{"respaldo":30,"permitido":\[0,70\]\}/);
  });

  it('si falla a mitad de turno no se repite nada: cuenta lo hecho y por qué se ha parado', async () => {
    const store = llmStore();
    const { provider } = scripted([
      { toolCalls: [{ id: 'a', name: 'set_light', args: { room: '202', pct: 30 } }] },
    ]);
    const agent = testAgent(store, new LlmPlanner(provider));
    const run = await agent.handle(makeEvent('voice', { text: 'luz al 30 en la 202' }, 0));

    expect(run.fellBack).toBe(false);
    expect(run.calls).toHaveLength(1);
    expect(store.getState().agent.fallbacks).toBe(0);
    expect(run.reply).toMatch(/30/);
    expect(run.reply).toMatch(/interrumpido/);
  });

  it('el bucle está acotado', async () => {
    const store = llmStore();
    const provider = new ScriptedProvider(() => ({
      toolCalls: [{ id: 'x', name: 'get_room_state', args: { room: '202' } }],
    }));
    const turn = await new LlmPlanner(provider).converse(
      {
        event: makeEvent('voice', { text: 'estado' }, 0),
        state: store.getState(),
        nowMin: 0,
      },
      (call) => runTool(call, store),
    );
    expect(turn.calls).toHaveLength(MAX_AGENT_STEPS);
    expect(turn.error).toBeInstanceOf(Error);
  });

  it('solo las órdenes de voz o texto llegan al agente de IA; el resto va al motor local', async () => {
    const store = llmStore();
    const provider = new ScriptedProvider(() => ({ toolCalls: [] }));
    const planner = new LlmPlanner(provider);
    const agent = testAgent(store, planner);

    const alarm = makeEvent('manual', { action: 'simulateAlarm', room: '202' }, 0);
    await expect(
      planner.converse({ event: alarm, state: store.getState(), nowMin: 0 }, () => {
        throw new Error('no debe ejecutar nada');
      }),
    ).rejects.toThrow();

    const run = await agent.handle(alarm);
    expect(run.planner).toBe('mock');
    expect(run.fellBack).toBe(false);
    expect(run.calls.every((c) => c.priority === PRIORITY.SAFETY)).toBe(true);
    expect(provider.lastRequest).toBeNull();
  });
});

describe('BackendProvider (backend propio)', () => {
  const request: LlmRequest = {
    system: 's',
    messages: [{ role: 'user', content: 'hola' }],
    tools: [],
  };

  it('envía la petición al endpoint y conserva el contenido original de la respuesta', async () => {
    const content = [
      { type: 'text', text: 'Bajo la luz.' },
      { type: 'tool_use', id: 'gemini-ab12-1', name: 'set_light', input: { room: '201', pct: 20 } },
      {
        type: 'gemini_content',
        parts: [{ functionCall: { name: 'set_light' }, thoughtSignature: 'f' }],
      },
    ];
    let sent: { url: string; body: unknown } | null = null;
    const provider = new BackendProvider({
      endpoint: '/api/agent',
      fetch: (url, init) => {
        sent = { url: String(url), body: JSON.parse(String(init?.body)) };
        return Promise.resolve(jsonResponse({ stop_reason: 'tool_use', content }));
      },
    });
    const out = await provider.complete(request);
    expect(sent).toEqual({ url: '/api/agent', body: request });
    expect(out.text).toBe('Bajo la luz.');
    expect(out.toolCalls).toEqual([
      { id: 'gemini-ab12-1', name: 'set_light', args: { room: '201', pct: 20 } },
    ]);
    expect(out.content).toEqual(content);
  });

  it('trata como fallo un error del backend, un rechazo del modelo o la falta de red', async () => {
    const withFetch = (impl: typeof fetch) =>
      new BackendProvider({ endpoint: '/api/agent', fetch: impl }).complete(request);

    await expect(
      withFetch(() => Promise.resolve(jsonResponse({ error: 'not_configured' }, 503))),
    ).rejects.toMatchObject({ name: 'LlmBackendError', status: 503 });
    await expect(
      withFetch(() => Promise.resolve(jsonResponse({ stop_reason: 'refusal', content: [] }))),
    ).rejects.toBeInstanceOf(LlmBackendError);
    await expect(
      withFetch(() => Promise.reject(new TypeError('fetch failed'))),
    ).rejects.toBeInstanceOf(LlmBackendError);
  });
});
