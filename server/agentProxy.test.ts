import { ApiError, type GenerateContentParameters } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FALLBACK_MODELS,
  DEFAULT_MODEL,
  MAX_BODY_BYTES,
  MODEL_COOLDOWN_MS,
  createAgentProxy,
  type ProxyRequest,
} from './agentProxy';
import { SKIP_SIGNATURE, fromGeminiResponse, toGeminiContents } from './geminiFormat';

const overloaded = () =>
  new ApiError({
    status: 503,
    message: JSON.stringify({
      error: { code: 503, message: 'This model is currently experiencing high demand.' },
    }),
  });

const tools = [
  {
    name: 'set_light',
    description: 'Luz',
    input_schema: {
      type: 'object',
      properties: {
        room: { type: 'string', pattern: '^20\\d$' },
        pct: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['room'],
      additionalProperties: false,
    },
  },
];
const validBody = {
  system: 'Eres un agente.',
  messages: [{ role: 'user', content: 'hola' }],
  tools,
};

function post(body: unknown, extra: Partial<ProxyRequest> = {}): ProxyRequest {
  return {
    method: 'POST',
    origin: 'http://localhost:5173',
    host: 'localhost:5173',
    contentType: 'application/json',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...extra,
  };
}

const textReply = (text: string) => ({
  candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text }] } }],
});

function proxyWithSpy(reply: unknown = textReply('ok')) {
  const sent: GenerateContentParameters[] = [];
  const handle = createAgentProxy({
    generateContent: (params) => {
      sent.push(params);
      return Promise.resolve(reply as never);
    },
  });
  return { handle, sent };
}

describe('backend del agente (/api/agent)', () => {
  it('traduce a Gemini fijando modelo y parámetros: el cliente no puede elegirlos', async () => {
    const { handle, sent } = proxyWithSpy();
    const out = await handle(
      post({ ...validBody, model: 'otro-modelo', maxOutputTokens: 999_999 }),
    );
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }, { type: 'gemini_content' }],
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.model).toBe(DEFAULT_MODEL);
    expect(sent[0]?.contents).toEqual([{ role: 'user', parts: [{ text: 'hola' }] }]);
    expect(sent[0]?.config).toMatchObject({
      systemInstruction: validBody.system,
      maxOutputTokens: 8192,
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      thinkingConfig: { thinkingLevel: 'LOW' },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'set_light',
              description: 'Luz',
              parametersJsonSchema: {
                ...tools[0]?.input_schema,
                properties: {
                  room: { type: 'string' },
                  pct: tools[0]?.input_schema.properties.pct,
                },
              },
            },
          ],
        },
      ],
    });
  });

  it('rechaza otros orígenes, otros formatos y cuerpos mal formados sin llamar a la API', async () => {
    const { handle, sent } = proxyWithSpy();
    expect((await handle(post(validBody, { origin: 'https://otra-web.example' }))).status).toBe(
      403,
    );
    expect((await handle(post(validBody, { contentType: 'text/plain' }))).status).toBe(415);
    expect((await handle(post('{no es json'))).status).toBe(400);
    expect((await handle(post({ system: 'x', messages: [], tools: [] }))).status).toBe(400);
    expect((await handle(post({ messages: validBody.messages, tools: [] }))).status).toBe(400);
    const orphan = {
      ...validBody,
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'nadie' }] }],
    };
    expect((await handle(post(orphan))).status).toBe(400);
    expect((await handle(post('x'.repeat(MAX_BODY_BYTES + 1)))).status).toBe(413);
    expect((await handle({ ...post(validBody), method: 'DELETE' })).status).toBe(405);
    expect(sent).toHaveLength(0);
  });

  it('GET informa de si hay credenciales, sin exponerlas', async () => {
    const out = await createAgentProxy({ apiKey: 'clave-de-prueba' })({ method: 'GET', body: '' });
    expect(out).toEqual({
      status: 200,
      body: { configured: true, model: DEFAULT_MODEL, fallbackModels: DEFAULT_FALLBACK_MODELS },
    });
    expect(JSON.stringify(out)).not.toContain('clave-de-prueba');
  });

  it('sin API key responde 503 y una clave inválida también se ve como «no configurado»', async () => {
    const saved = { g: process.env.GEMINI_API_KEY, k: process.env.GOOGLE_API_KEY };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      const out = await createAgentProxy()(post(validBody));
      expect(out).toMatchObject({ status: 503, body: { error: 'not_configured' } });
    } finally {
      if (saved.g !== undefined) process.env.GEMINI_API_KEY = saved.g;
      if (saved.k !== undefined) process.env.GOOGLE_API_KEY = saved.k;
    }
    const badKey = createAgentProxy({
      generateContent: () =>
        Promise.reject(new ApiError({ status: 400, message: 'API key not valid' })),
    });
    expect(await badKey(post(validBody))).toMatchObject({
      status: 503,
      body: { error: 'not_configured' },
    });
  });

  it('si el modelo principal está saturado pasa al de respaldo y lo aparta un rato', async () => {
    let clock = 0;
    const tried: string[] = [];
    const logs: string[] = [];
    const handle = createAgentProxy({
      now: () => clock,
      log: (m) => logs.push(m),
      generateContent: (params) => {
        tried.push(params.model);
        if (params.model === DEFAULT_MODEL) return Promise.reject(overloaded());
        return Promise.resolve(textReply(`ok desde ${params.model}`) as never);
      },
    });

    const first = await handle(post(validBody));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      content: [
        { type: 'text', text: `ok desde ${DEFAULT_FALLBACK_MODELS[0]}` },
        { type: 'gemini_content', model: DEFAULT_FALLBACK_MODELS[0] },
      ],
    });
    expect(tried).toEqual([DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS[0]]);
    expect(logs.join(' ')).toMatch(/no disponible \(503\)/);

    // Durante el enfriamiento ni se intenta el modelo saturado.
    tried.length = 0;
    await handle(post(validBody));
    expect(tried).toEqual([DEFAULT_FALLBACK_MODELS[0]]);

    // Pasado el enfriamiento se vuelve a probar el principal.
    clock += MODEL_COOLDOWN_MS + 1;
    tried.length = 0;
    await handle(post(validBody));
    expect(tried[0]).toBe(DEFAULT_MODEL);
  });

  it('si todos están saturados, explica qué ha probado y qué ha dicho Gemini', async () => {
    const handle = createAgentProxy({
      log: () => undefined,
      generateContent: () => Promise.reject(overloaded()),
    });
    const out = await handle(post(validBody));
    expect(out.status).toBe(503);
    expect(out.body).toMatchObject({ error: 'models_unavailable' });
    const message = (out.body as { message: string }).message;
    for (const m of [DEFAULT_MODEL, ...DEFAULT_FALLBACK_MODELS]) expect(message).toContain(m);
    expect(message).toContain('high demand');
  });

  it('un error de la petición (400) no se reintenta en otros modelos', async () => {
    const tried: string[] = [];
    const handle = createAgentProxy({
      generateContent: (params) => {
        tried.push(params.model);
        return Promise.reject(new ApiError({ status: 400, message: 'Invalid schema' }));
      },
    });
    const out = await handle(post(validBody));
    expect(out).toMatchObject({ status: 502, body: { error: 'upstream_error' } });
    expect(tried).toHaveLength(1);
  });

  it('un turno sigue con el modelo que lo empezó; si cambia, usa la firma comodín', async () => {
    const parts = [
      { functionCall: { name: 'set_light', args: { room: '202' } }, thoughtSignature: 'f' },
    ];
    const assistant = {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 't1', name: 'set_light', input: { room: '202' } },
        { type: 'gemini_content', parts, model: DEFAULT_FALLBACK_MODELS[0] },
      ],
    };
    const result = {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}', is_error: false }],
    };
    const messages = [{ role: 'user', content: 'hola' }, assistant, result];

    const { handle, sent } = proxyWithSpy();
    await handle(post({ ...validBody, messages }));
    expect(sent[0]?.model).toBe(DEFAULT_FALLBACK_MODELS[0]);
    expect((sent[0]?.contents as { parts: unknown[] }[])[1]?.parts).toEqual(parts);

    const other = toGeminiContents(messages as never, DEFAULT_MODEL);
    expect(other[1]?.parts?.[0]).toMatchObject({ thoughtSignature: SKIP_SIGNATURE });
  });

  it('limita la frecuencia de peticiones', async () => {
    const { handle } = proxyWithSpy();
    const statuses: number[] = [];
    for (let i = 0; i < 45; i += 1) statuses.push((await handle(post(validBody))).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(40);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('traducción al formato de Gemini', () => {
  const modelParts = [
    {
      functionCall: { name: 'set_light', args: { room: '202', pct: 30 } },
      thoughtSignature: 'firma-1',
    },
    { functionCall: { name: 'get_room_state', args: { room: '202' } } },
  ];

  it('las llamadas a funciones vuelven como tool_use y conservan las parts originales', () => {
    const out = fromGeminiResponse({
      candidates: [
        { finishReason: 'STOP' as never, content: { role: 'model', parts: modelParts } },
      ],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { stop_reason, content } = out.response;
    expect(stop_reason).toBe('tool_use');
    expect(content.filter((b) => b.type === 'tool_use')).toMatchObject([
      { name: 'set_light', input: { room: '202', pct: 30 } },
      { name: 'get_room_state', input: { room: '202' } },
    ]);
    const ids = content.filter((b) => b.type === 'tool_use').map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
    expect(content.at(-1)).toEqual({ type: 'gemini_content', parts: modelParts });
  });

  it('reenvía el turno del modelo sin tocar (con su firma) y agrupa los resultados', () => {
    const out = fromGeminiResponse({
      candidates: [
        { finishReason: 'STOP' as never, content: { role: 'model', parts: modelParts } },
      ],
    });
    if (!out.ok) throw new Error('debería ser ok');
    const [a, b] = out.response.content.filter((x) => x.type === 'tool_use');
    const contents = toGeminiContents([
      { role: 'user', content: 'luz al 30 en la 202 y dime cómo queda' },
      { role: 'assistant', content: out.response.content },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: a?.id, content: '{"lightPct":30}', is_error: false },
          { type: 'tool_result', tool_use_id: b?.id, content: '{"error":"x"}', is_error: true },
        ],
      },
    ]);
    expect(contents[1]).toEqual({ role: 'model', parts: modelParts });
    expect(contents[2]).toEqual({
      role: 'user',
      parts: [
        { functionResponse: { name: 'set_light', response: { result: { lightPct: 30 } } } },
        { functionResponse: { name: 'get_room_state', response: { error: { error: 'x' } } } },
      ],
    });
  });

  it('los bloqueos de seguridad se ven como rechazo y el texto de razonamiento se omite', () => {
    expect(
      fromGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' as never } }),
    ).toMatchObject({ ok: true, response: { stop_reason: 'refusal' } });
    expect(
      fromGeminiResponse({ candidates: [{ finishReason: 'PROHIBITED_CONTENT' as never }] }),
    ).toMatchObject({ ok: true, response: { stop_reason: 'refusal' } });
    expect(
      fromGeminiResponse({ candidates: [{ finishReason: 'MALFORMED_FUNCTION_CALL' as never }] }),
    ).toMatchObject({ ok: false, error: 'malformed_function_call' });
    const thought = fromGeminiResponse({
      candidates: [
        {
          finishReason: 'STOP' as never,
          content: { parts: [{ text: 'pensando…', thought: true }, { text: 'Hecho.' }] },
        },
      ],
    });
    expect(thought).toMatchObject({
      ok: true,
      response: { content: [{ type: 'text', text: 'Hecho.' }, { type: 'gemini_content' }] },
    });
  });
});
