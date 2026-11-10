# El agente de IA de NeumaCare

Las órdenes de voz y de texto las atiende un agente con **Gemini** (Google) que gestiona las habitaciones **llamando a las funciones del agente** (`src/core/tools/`). Esta guía explica cómo activarlo, cómo funciona y qué hay que cuidar al desplegarlo.

## 1. Activarlo en local

1. Crea una API key en [Google AI Studio](https://aistudio.google.com/apikey).
2. Cópiala en `.env.local`:

   ```bash
   cp .env.example .env.local   # escribe tu GEMINI_API_KEY
   npm run dev
   ```

- La clave **solo** la lee el servidor de Vite (`server/vitePlugin.ts`). No lleva el prefijo `VITE_`, así que nunca entra en el bundle, y `.env.local` está en `.gitignore`. También vale `GOOGLE_API_KEY`.
- Al arrancar, la interfaz hace `GET /api/agent`. Si hay clave, el agente de IA queda seleccionado en _Agente → Cerebro del agente_ con la etiqueta «conectado». Si no, se muestra «sin API key» y el chat lo atiende el intérprete local.
- Opcional: `NEUMACARE_MODEL` en `.env.local` cambia el modelo (por defecto `gemini-3.8-flash`). Por ejemplo, `gemini-3.5-flash-lite` es más rápido y barato, y `gemini-4-argon` razona más a cambio de latencia.
- Opcional: `NEUMACARE_FALLBACK_MODELS` (lista separada por comas) fija los modelos de respaldo; por defecto `gemini-3.6-flash,gemini-3.5-flash-lite`. Ver «Modelos saturados» más abajo.

## 2. Arquitectura

```
Navegador (Vite/React)                      Backend propio                       Google
──────────────────────                      ──────────────                       ──────
VoicePanel (voz o texto)
  └─ agent.handle(evento 'voice')
       └─ LlmPlanner.converse()  ◄─┐
            │ provider.complete()  │
            ├──────────────────────┼──► POST /api/agent ─────────────────────► Gemini API
            │ { system, messages,  │      · comprueba origen, tamaño y forma     generateContent
            │   tools }            │      · traduce al formato de Gemini         (function calling)
            │ ◄────────────────────┼───── · añade la API key y fija el modelo ◄──
            │ tool_use → runTool() │
            └─ tool_result ────────┘  (se repite hasta que el modelo responde con texto)
```

El estado de la planta vive en memoria en el navegador, así que **las funciones se ejecutan en el cliente** y el backend es un proxy que traduce formatos. El bucle es el habitual del function calling: el modelo propone llamadas, el cliente las ejecuta y devuelve todos los resultados juntos, y se repite mientras el modelo pida funciones (máximo `MAX_AGENT_STEPS` vueltas).

El navegador no conoce el formato de Gemini: habla con el backend con mensajes de bloques `text`, `tool_use` y `tool_result`. `server/geminiFormat.ts` hace la traducción en los dos sentidos:

| Navegador                         | Gemini                                                                  |
| --------------------------------- | ----------------------------------------------------------------------- |
| `system`                          | `config.systemInstruction`                                              |
| `tools[].input_schema`            | `functionDeclarations[].parametersJsonSchema` (JSON Schema estándar)    |
| turno `assistant`                 | contenido `model`: se reenvían **las `parts` originales sin modificar** |
| bloque `tool_use`                 | part `functionCall` (el id se genera si Gemini no lo da)                |
| bloques `tool_result` de un turno | un solo contenido `user` con una part `functionResponse` por llamada    |
| `stop_reason`                     | `finishReason` y `promptFeedback.blockReason`                           |

| Pieza                 | Archivo                    | Qué hace                                                                                                                         |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Registro de funciones | `src/core/tools/index.ts`  | Cada función se define una vez con Zod. `toToolDefinitions()` genera `[{ name, description, input_schema }]`.                    |
| `runTool(call)`       | `src/core/tools/index.ts`  | Valida con Zod → recorta rangos → comprueba prioridades → ejecuta → registra. Nunca lanza.                                       |
| `LlmPlanner`          | `src/core/planners/llm.ts` | Prompt del sistema, contexto, bucle modelo → funciones → modelo. Asigna a cada llamada la prioridad del evento.                  |
| `BackendProvider`     | `src/core/llm/backend.ts`  | `fetch` al backend propio; comprueba `stop_reason` y conserva el `content` original para reenviarlo sin tocar.                   |
| Bucle del agente      | `src/core/agent.ts`        | Decide quién atiende cada evento, serializa las órdenes a la IA, gestiona la caída al motor local y dice la respuesta (`speak`). |
| Backend               | `server/agentProxy.ts`     | Guarda la clave, valida la petición, fija modelo y parámetros y llama a Gemini con el SDK oficial (`@google/genai`).             |
| Traducción            | `server/geminiFormat.ts`   | Convierte mensajes y herramientas al formato de Gemini y la respuesta de vuelta.                                                 |
| Montaje en Vite       | `server/vitePlugin.ts`     | Sirve `/api/agent` en `npm run dev` y `npm run preview`.                                                                         |

### Qué recibe el modelo

- **Instrucción del sistema** (`buildSystemPrompt()`): fija entre peticiones.
- **Un mensaje por orden** con `{ orden, contexto }`. El contexto (`buildContextSummary()`) lleva hora simulada, idioma, habitación abierta, estado ambiental de las diez habitaciones, agenda de disparadores y los últimos mensajes de la conversación (por eso entiende «y ahora un poco menos»).
- **Herramientas**: todas las funciones salvo `speak` (su respuesta final ya se dice y se muestra), `classify_patient` y `clear_patient` (ver `LLM_EXCLUDED_TOOLS`).

### Garantías que no dependen del modelo

- **La prioridad la decide el evento, no el modelo.** Una orden de voz o texto es prioridad 2 (`priorityForEvent`). El modelo no puede escalar a «seguridad».
- **Solo las órdenes de voz o texto llegan a la IA** (`isLlmEvent`). Disparadores, cambios de fase, ruido y alarmas clínicas los resuelve siempre el motor local: son frecuentes, deben ser instantáneos y reproducibles, y no pueden depender de la red.
- **Todo pasa por `runTool`**: rangos, rangos por categoría, bloqueo de aroma por alergia y jerarquía de prioridades se aplican igual con o sin IA. Un rechazo vuelve al modelo como resultado de error, y el modelo lo explica.
- **Sin datos clínicos**: el contexto lleva categoría, protocolo y valores, nunca el formulario del paciente; `get_room_state` tampoco lo devuelve, y el modelo no puede clasificar ni borrar pacientes.
- **Caída al motor local**: si la IA falla antes de ejecutar nada (sin clave, sin red, error de la API, bloqueo de seguridad), responde el intérprete local y queda registrado como `planner_fallback`. Si falla a mitad de turno no se repite nada: el agente cuenta lo que sí hizo y por qué se paró.

## 3. El backend (`server/agentProxy.ts`)

`createAgentProxy()` devuelve una función `(ProxyRequest) → ProxyResponse` sobre datos planos, sin depender de ningún framework. La petición a Gemini es:

```ts
ai.models.generateContent({
  model: 'gemini-3.8-flash',
  contents: toGeminiContents(body.messages),
  config: {
    systemInstruction: body.system,
    tools: [{ functionDeclarations: toFunctionDeclarations(body.tools) }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
    maxOutputTokens: 8192,
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  },
});
```

Notas sobre el modelo y los parámetros:

- **Modo `AUTO`**: el modelo decide si llama a funciones o responde con texto (así puede preguntar cuando falta un dato).
- **Razonamiento**: los modelos Gemini 3 y 4 razonan siempre; `thinkingLevel: LOW` prima la latencia, porque son órdenes cortas. Súbelo a `MEDIUM` si quieres más criterio en peticiones abiertas. Con modelos 2.5 no se envía (usan `thinkingBudget`).
- **`maxOutputTokens` incluye el razonamiento**: con un límite bajo la respuesta se cortaría.
- **Firmas de razonamiento (`thoughtSignature`)**: Gemini 3 y 4 las adjuntan a las llamadas a funciones y **exigen** recibirlas de vuelta, o la petición falla con un 400. Por eso el backend devuelve las `parts` originales en un bloque `gemini_content`, el cliente lo guarda tal cual y el backend lo reenvía sin modificar. El historial solo crece: no se editan ni reordenan turnos anteriores.
- **Resultados de funciones**: todos los de un turno van en un solo contenido `user`, en el mismo orden que las llamadas (intercalarlos da un 400).
- **Bloqueos**: si `promptFeedback.blockReason` está presente, o `finishReason` es `SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII` o `RECITATION`, el backend responde `stop_reason: "refusal"` y el cliente lo trata como fallo. `MALFORMED_FUNCTION_CALL` se devuelve como error 502.
- **Modelos saturados**: los modelos más nuevos de Gemini responden a menudo `503 UNAVAILABLE` («This model is currently experiencing high demand»). El backend no espera ni reintenta el mismo modelo: pasa al siguiente de la cadena (`NEUMACARE_MODEL` y después `NEUMACARE_FALLBACK_MODELS`) y aparta el saturado durante 60 s. Lo mismo con 429 (cuota del modelo agotada), 404 (modelo no disponible para tu clave) y errores 5xx; un 400 no se reintenta, porque fallaría igual en cualquier modelo. Cada cambio queda anotado en la consola del servidor como `[agente] …`, sin datos de la petición. Si todos fallan, la interfaz muestra qué modelos se han probado y el último error de Gemini, y responde el motor local.
- **Un turno, un modelo**: las firmas de razonamiento solo valen para el modelo que las generó. Por eso, mientras dura una orden, el backend sigue con el modelo que la empezó (lo guarda en el bloque `gemini_content`). Si ese modelo deja de estar disponible a mitad, el turno sigue en otro y las firmas anteriores se sustituyen por la firma comodín que documenta Google (`skip_thought_signature_validator`).

Protecciones del proxy: solo acepta `POST` con `Content-Type: application/json` desde el mismo origen (otra web no puede gastar tu clave), limita el tamaño del cuerpo y el número de mensajes y herramientas, ignora cualquier parámetro del cliente que no sea `system`, `messages` y `tools`, limita a 40 peticiones por minuto y no registra el cuerpo de las peticiones.

## 4. Desplegarlo fuera de Vite

`npm run build` genera un sitio estático: sin backend, la interfaz muestra «sin backend» y sigue con el motor local. Para tener el agente de IA en producción, sirve `/api/agent` con el mismo handler. Ejemplo con el formato Web `Request`/`Response` (Vercel, Netlify Functions, Cloudflare Workers con `nodejs_compat`…):

```ts
// api/agent.ts — GEMINI_API_KEY es una variable de entorno del proveedor.
import { createAgentProxy } from '../server/agentProxy';

const handle = createAgentProxy({ allowedOrigins: ['https://tu-dominio.example'] });

export default async function handler(req: Request): Promise<Response> {
  const out = await handle({
    method: req.method,
    origin: req.headers.get('origin') ?? undefined,
    host: req.headers.get('host') ?? undefined,
    contentType: req.headers.get('content-type') ?? undefined,
    body: req.method === 'POST' ? await req.text() : '',
  });
  return Response.json(out.body, { status: out.status });
}
```

Si el backend vive en otro dominio, cambia `LLM_ENDPOINT` en `src/core/runtime.ts` y configura CORS en el handler.

## 5. Lista de comprobación de seguridad y privacidad

- [ ] La API key solo existe como variable de entorno del backend (nunca con prefijo `VITE_`).
- [ ] En producción, el backend **autentica al personal** antes de aceptar peticiones. El proxy incluido solo comprueba el origen y limita la frecuencia: es suficiente para desarrollo local, no para un despliegue público.
- [ ] Con el **nivel gratuito** de la API de Gemini, Google puede usar el contenido enviado para mejorar sus productos. Para datos reales, usa un proyecto con facturación activada y revisa sus condiciones de uso de datos.
- [ ] No se registran en el backend cuerpos de petición (llevan el estado de las habitaciones y lo que escribe el usuario).
- [ ] El aviso de privacidad de la interfaz informa de que, con el agente de IA, las órdenes y el estado ambiental se envían a Google.
- [ ] La clasificación de pacientes sigue siendo determinista y manual: el modelo no recibe `classify_patient` ni `clear_patient`.
- [ ] Las pruebas `src/core/__tests__/planner.test.ts` y `server/agentProxy.test.ts` siguen pasando.
