# Conectar un LLM a NeumaCare

Hoy el agente usa el **MockPlanner**, un motor de políticas determinista y local. La arquitectura ya está lista para sustituirlo por un LLM sin tocar la UI ni las funciones del agente. Esta guía explica cómo hacerlo **sin exponer nunca la API key en el navegador**.

> En esta fase no se hace ninguna llamada de red. `AnthropicProvider.complete()` siempre rechaza con `LlmNotConfiguredError` y el agente cae al MockPlanner.

## 1. Qué hay ya en el código

| Pieza                      | Archivo                       | Qué hace                                                                                                                            |
| -------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Registro de funciones      | `src/core/tools/index.ts`     | Cada función se define una vez con Zod. `toToolDefinitions()` genera `[{ name, description, input_schema }]` (formato Anthropic).   |
| `runTool(call)`            | `src/core/tools/index.ts`     | Valida con Zod → recorta rangos → comprueba prioridades → ejecuta → registra. Nunca lanza.                                          |
| `interface LlmProvider`    | `src/core/llm/types.ts`       | `complete({ system, messages, tools }) → { toolCalls, text? }`                                                                      |
| `AnthropicProvider` (stub) | `src/core/llm/anthropic.ts`   | Rechaza con "no configurado". Incluye `parseMessagesResponse()`, que ya convierte bloques `text`/`tool_use` en `ToolCall[]`.        |
| `LlmPlanner`               | `src/core/planners/llm.ts`    | Construye el prompt del sistema y el contexto, llama al proveedor, valida cada llamada con Zod y le asigna la prioridad del evento. |
| Caída al Mock              | `src/core/agent.ts`           | `planWithFallback()`: si el LLM lanza o propone una llamada inválida, se descarta su plan, se usa el MockPlanner y se registra.     |
| Selector de planner        | `src/ui/agent/AgentPanel.tsx` | La opción LLM está deshabilitada mientras `LLM_AVAILABLE = false` (`src/core/runtime.ts`).                                          |

Garantías que no dependen del LLM:

- **La prioridad la decide el evento, no el modelo.** Una orden de voz es prioridad 2, un disparador de comida es 3, etc. (`priorityForEvent`). El LLM no puede escalar a "seguridad".
- **Los eventos de seguridad nunca se delegan** (`isDeterministicOnly`): una alarma clínica siempre la resuelve el motor local.
- **Todo pasa por `runTool`**: rangos, rangos por categoría, bloqueo de aroma por alergia y jerarquía de prioridades se aplican igual con o sin LLM.
- **Sin datos clínicos en el prompt**: `buildContextSummary()` envía categoría, protocolo y valores, nunca el formulario del paciente.

## 2. Arquitectura propuesta

```
Navegador (Vite/React)                Backend propio (serverless)             Anthropic
──────────────────────                ───────────────────────────             ─────────
LlmPlanner
  └─ AnthropicProvider.complete() ──► POST /api/agent ──────────────────────► Messages API
       { system, messages, tools }      · comprueba sesión/origen               (tool use)
                                        · añade la API key (variable de entorno)
     ◄── cuerpo de la respuesta ◄────── · reenvía y devuelve la respuesta ◄───
  parseMessagesResponse() → ToolCall[]
  → validación Zod → runTool()
```

La API key **solo** vive en el backend (variable de entorno del proveedor serverless). El cliente nunca la ve, ni en el bundle ni en las peticiones.

## 3. Backend: función serverless (TypeScript, Node)

Instala el SDK oficial **en el proyecto del backend**, no en el cliente:

```bash
npm install @anthropic-ai/sdk
```

Ejemplo de handler (formato Web `Request`/`Response`, válido en Vercel, Netlify Functions, Cloudflare Workers con `nodejs_compat`, etc.):

```ts
// api/agent.ts — se ejecuta en el servidor; ANTHROPIC_API_KEY es una variable de entorno.
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'https://tu-dominio.example';
const MAX_BODY_BYTES = 200_000;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (req.headers.get('origin') !== ALLOWED_ORIGIN)
    return new Response('Forbidden', { status: 403 });
  // Aquí también: autenticación del personal y límite de peticiones por usuario.

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response('Payload too large', { status: 413 });

  let body: { system?: unknown; messages?: unknown; tools?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  if (
    typeof body.system !== 'string' ||
    !Array.isArray(body.messages) ||
    !Array.isArray(body.tools)
  ) {
    return new Response('Bad request', { status: 400 });
  }

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: body.system,
      messages: body.messages as Anthropic.Beta.BetaMessageParam[],
      tools: body.tools as Anthropic.Beta.BetaTool[],
      tool_choice: { type: 'auto' },
      output_config: { effort: 'low' }, // decisiones cortas y frecuentes; súbelo si hace falta más criterio
      // Si un clasificador de seguridad rechaza la petición, la API la reintenta en otro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    return Response.json(response);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError)
      return new Response('Rate limited', { status: 429 });
    if (error instanceof Anthropic.APIError) return new Response('Upstream error', { status: 502 });
    return new Response('Internal error', { status: 500 });
  }
}
```

Notas sobre el modelo y los parámetros:

- **Modelo**: `claude-opus-5-5`. Usa el identificador tal cual, sin sufijo de fecha.
- **`tool_choice`**: usa `auto`. En este modelo el uso forzado (`any` o `tool`) devuelve un 400. El prompt del sistema ya indica que solo debe actuar mediante funciones.
- **Razonamiento**: en este modelo siempre está activo. No envíes `thinking: { type: 'disabled' }` ni `budget_tokens` (ambos dan 400). La profundidad se controla con `output_config.effort` (`low`, `medium`, `high`, `xhigh` o `max`; por defecto `medium`).
- **Rechazos**: comprueba siempre `stop_reason` antes de leer `content`. Si vale `"refusal"`, el cliente debe tratarlo como un fallo, y el agente caerá al MockPlanner. El ejemplo incluye `fallbacks: 'default'` para que la API reintente en otro modelo; quítalo si no lo quieres.
- **Sin `temperature`/`top_p`/`top_k`**: no se admiten en este modelo.

## 4. Cliente: implementar `AnthropicProvider.complete()`

Sustituye el stub por una llamada a **tu** endpoint (nunca a `api.anthropic.com` desde el navegador):

```ts
// src/core/llm/anthropic.ts
complete(req: LlmRequest): Promise<LlmResponse> {
  const endpoint = this.options.endpoint;
  if (!endpoint) return Promise.reject(new LlmNotConfiguredError());
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // sesión del personal, si la hay
    body: JSON.stringify(req),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Backend LLM respondió ${res.status}`);
      const body = (await res.json()) as { stop_reason?: string };
      if (body.stop_reason === 'refusal') throw new Error('El modelo rechazó la petición');
      return AnthropicProvider.parseMessagesResponse(body);
    });
}
```

Y en `src/core/runtime.ts`:

```ts
export const llmPlanner = new LlmPlanner(new AnthropicProvider({ endpoint: '/api/agent' }));
export const LLM_AVAILABLE = true; // habilita la opción en el selector de la UI
```

Cualquier error (red, 4xx/5xx, rechazo o llamada inválida) hace que `planWithFallback()` use el MockPlanner y lo deje registrado como `planner_fallback` en el panel del agente.

## 5. ¿Hace falta un bucle con `tool_result`?

En el diseño actual, **no**: cada evento produce una única petición. El modelo propone llamadas a funciones, el cliente las valida y ejecuta con `runTool`, y el resultado queda en el registro. Es suficiente para órdenes de voz y disparadores, y mantiene el coste y la latencia bajos.

Si más adelante quieres que el modelo **vea los resultados** antes de decidir (por ejemplo, consultar `get_room_state` y luego actuar), convierte el planner en un bucle acotado:

1. Tras ejecutar las llamadas, añade a `messages` el turno del asistente **con su `content` completo y sin modificar** (incluidos los bloques `thinking`). Después añade un turno `user` que contenga **todos** los resultados en un solo mensaje:
   ```ts
   messages.push({ role: 'assistant', content: response.content });
   messages.push({
     role: 'user',
     content: results.map((r, i) => ({
       type: 'tool_result',
       tool_use_id: toolUses[i].id,
       content: JSON.stringify(r.ok ? r.result : { error: r.error }),
       is_error: !r.ok,
     })),
   });
   ```
2. Repite mientras `stop_reason === 'tool_use'`, con un máximo de vueltas (p. ej. 4).
3. No edites ni reordenes turnos anteriores: el historial debe ser solo de añadir.

Para esto, el backend debe aceptar `messages` con contenido estructurado (ya lo hace: los reenvía tal cual), y `LlmResponse` debería exponer el `content` original además de `toolCalls`.

## 6. Lista de comprobación de seguridad y privacidad

- [ ] La API key solo existe como variable de entorno del backend.
- [ ] El backend valida el origen, autentica al personal y limita la frecuencia de peticiones.
- [ ] No se registran en el backend cuerpos de petición con datos de pacientes (el contexto ya excluye el formulario, pero conviene no guardar logs del cuerpo).
- [ ] La clasificación de pacientes sigue siendo la función `classify_patient`. El LLM puede invocarla, pero el resultado lo calcula siempre el clasificador determinista.
- [ ] Las pruebas `src/core/__tests__/planner.test.ts` siguen pasando: caída al Mock, prioridad del evento y seguridad nunca delegada.
