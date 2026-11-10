# NeumaCare · Panel de planta

Panel web para una planta hospitalaria **simulada** (habitaciones 201–210) con:

1. **Plano 2D** (SVG) de la planta.
2. **Habitación en 3D** (three.js) con un menú lateral para manipular el entorno.
3. **Agente de IA** que actúa **solo mediante funciones** (tool calling). Las órdenes de voz o de texto las atiende un agente con Gemini (o, sin API key, un intérprete local por reglas), y un motor de políticas determinista reacciona a los disparadores horarios (comidas, medicación, curas…).

La habitación se personaliza clasificando al paciente en 3 categorías a partir de un formulario. **Nada se persiste.**

> ⚠️ **Todo es una simulación**: no hay sensores ni dispositivos reales, ni cámaras, ni audio grabado. Los datos solo viven en memoria y se borran al recargar la página. Si activas el agente de IA, las órdenes y el estado ambiental de las salas se envían a Google (ver [Privacidad](#privacidad)).

## Instalación y scripts

Requisitos: Node 18 o superior.

```bash
npm install
npm run dev        # http://localhost:5173
```

### Activar el agente de IA

El chat de voz y texto puede atenderlo un agente de IA (Gemini). Necesita una API key de Gemini, que puedes crear en [Google AI Studio](https://aistudio.google.com/apikey) y que **solo lee el servidor de Vite** (nunca llega al navegador):

```bash
cp .env.example .env.local   # y escribe tu GEMINI_API_KEY
npm run dev
```

Al arrancar, la interfaz pregunta al backend (`GET /api/agent`) si hay clave. Si la hay, el agente de IA queda seleccionado como «cerebro» en el panel _Agente_; si no, la aplicación funciona igual con el intérprete local. Detalles en **[docs/LLM.md](docs/LLM.md)**.

| Script              | Qué hace                                               |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Servidor de desarrollo (Vite) + backend `/api/agent`   |
| `npm run build`     | Comprobación de tipos y build de producción en `dist/` |
| `npm run preview`   | Sirve el build (también con `/api/agent`)              |
| `npm test`          | Pruebas unitarias del núcleo (Vitest)                  |
| `npm run lint`      | ESLint, sin avisos permitidos (`--max-warnings 0`)     |
| `npm run typecheck` | `tsc` estricto (app y configuración de Vite)           |
| `npm run format`    | Prettier                                               |

## Stack

Vite · React 18 · TypeScript (`strict`) · three.js con `@react-three/fiber` y `@react-three/drei` · Zustand (solo en memoria, sin `persist`) · Zod con `zod-to-json-schema` · Tailwind CSS · Vitest · ESLint y Prettier.

## Estructura

```
src/
  core/                    # lógica pura: sin React, sin DOM (lo vigila ESLint)
    types.ts               # Room, Trigger, AgentEvent, ToolCall, prioridades…
    state.ts               # store Zustand (vanilla) y acciones puras (rampas, fin de eventos…)
    time.ts · color.ts · ids.ts
    classify.ts            # clasificador A/B/C por pesos, detrás de la interfaz Classifier
    scheduler.ts           # reloj simulado, ventanas de disparo y motor de ticks
    agent.ts               # bucle: evento → (agente de IA | motor local) → runTool → confirmación
    runtime.ts             # instancias únicas (agente, motor, planners)
    tools/                 # una función por archivo + index.ts (registro, JSON Schema, runTool)
    policy/                # motor de políticas: prioridades, protocolos×categoría, perfiles horarios
    voice/                 # intérprete por reglas: texto → ToolCall[] (números en palabras)
    planners/              # MockPlanner (motor local) y LlmPlanner (agente de IA: bucle con tool_result)
    llm/                   # interfaz LlmProvider, BackendProvider (vía backend) y ScriptedProvider
    __tests__/             # pruebas unitarias
  ui/
    map/                   # plano 2D
    room/                  # escena 3D, menú lateral, registro de decisiones, audio WebAudio
    agent/                 # panel del agente y agenda de disparadores
    voice/                 # useVoice() (Web Speech API) y caja de texto
    patient/               # formulario y resultado de la clasificación
    common/ · layout/      # componentes compartidos, cabecera y aviso de privacidad
  i18n/                    # es.ts (por defecto), ca.ts, en.ts
  App.tsx · main.tsx
server/
  agentProxy.ts            # backend del agente: guarda la API key y llama a Gemini (SDK @google/genai)
  geminiFormat.ts          # traducción entre el formato del navegador y el de Gemini
  vitePlugin.ts            # lo monta en /api/agent dentro de Vite (dev y preview)
docs/LLM.md                # cómo funciona el agente de IA y cómo desplegar el backend
```

**Reglas de arquitectura**

- `core/` no importa nada de `ui/`, React ni three.js. Una regla de ESLint lo impide.
- Las **funciones del agente** son la única vía para cambiar el entorno desde el agente, la voz o los disparadores. Los controles manuales de la UI también pasan por ellas, con prioridad de orden manual.

## Cómo funciona

### Funciones del agente

Cada función se define una sola vez con Zod en `src/core/tools/`: nombre, descripción, esquema, rangos y `execute`. A partir de ese registro se obtiene todo lo demás:

- `toToolDefinitions()` / `toOpenAiTools()` generan las herramientas en JSON Schema, con `minimum`/`maximum` tomados de los rangos. Puedes verlas en el panel _Agente → Funciones disponibles_.
- `runTool(call)` valida con Zod → recorta a rangos → comprueba prioridades → ejecuta → registra el motivo → devuelve `{ok, result}` o `{ok:false, error}`. **Nunca lanza.**

Funciones disponibles: `set_temperature`, `set_light`, `set_sound`, `set_aroma`, `apply_protocol`, `classify_patient`, `schedule_trigger`, `cancel_trigger`, `list_triggers`, `notify_staff`, `get_room_state`, `open_room` y `speak`. Además hay dos auxiliares: `set_auto_mode` y `clear_patient`.

### Jerarquía de prioridades

| Nº  | Prioridad                        | Ejemplos                                    |
| --- | -------------------------------- | ------------------------------------------- |
| 1   | Seguridad clínica y alarmas      | Alarma clínica (sin rampa)                  |
| 2   | Orden manual (personal/paciente) | Sliders, protocolos, voz, cura pedida       |
| 3   | Procedimientos programados       | Comidas, medicación, cura, constantes       |
| 4   | Protección del sueño             | Descanso 22:00–06:00, ruido nocturno        |
| 5   | Intención terapéutica inferida   | Activación matinal, ambiente diurno, visita |
| 6   | Neutro                           | —                                           |

Cada acción crea un _evento activo_ (override) con su prioridad, su hora de fin y, si procede, un punto de retorno. Una acción de menor prioridad se rechaza mientras el evento esté activo, y el rechazo queda en el registro con su motivo. Al terminar el evento, la sala **vuelve gradualmente** al estado previo.

### Rampas

Los valores se mueven un **15 % de la distancia restante por paso**, con un paso por tick de 1 s a velocidad 1×. A velocidades altas se aplican varios pasos por tick, de modo que un cambio tarda unos 1–3 min simulados. Nunca hay saltos, salvo en seguridad clínica.

### Categorías (sin guardar)

El clasificador (`core/classify.ts`) es determinista: cada rasgo aporta _peso × valor_. Los pesos se ven en _Paciente → Por qué esta categoría_. Un riesgo alto de delirium fuerza la categoría B por regla de seguridad.

- **A · Calma y confort**: luz cálida de 2400–2700 K y atenuada, sonido natural suave, respiración guiada y lavanda opcional.
- **B · Descanso y orientación**: ciclo circadiano muy marcado, sonidos estables, sin aroma y noche muy oscura y silenciosa.
- **C · Activación y recuperación**: despertar progresivo, luz fría de día y aroma cítrico leve opcional.

Cada categoría fija **rangos por protocolo** (`core/policy/protocols.ts`) que el agente respeta siempre. Los requisitos clínicos (por ejemplo, cura = luz al 100 % a 4000 K y silencio) prevalecen sobre la categoría. **Alergia a aromas ⇒ difusor bloqueado siempre.** El aroma solo se activa si el paciente lo desea.

Al arrancar hay tres pacientes de ejemplo simulados (201 → A, 203 → B, 205 → C). El botón _Borrar datos del paciente_ los elimina también del registro de llamadas.

### Disparadores horarios

Reloj simulado con velocidades **pausa, 1×, 60× y 600×**, y un botón _Ir a_ para saltar a una hora. La agenda por defecto es: despertar 07:00, constantes 08:00 y 16:00, desayuno 08:30, medicación 09:00, 15:00 y 21:00, cura 11:00 (205), comida 13:30, merienda 17:00, visita 18:00, cena 20:30 y descanso 22:00.

Cada disparador tiene una **ventana** `[hora, hora + duración)` y dispara una sola vez por ventana (`lastFiredKey = "día@HH:mm"`), aunque el reloj avance a saltos. Desde la UI se pueden crear, editar, activar y borrar disparadores, y hay un botón _Disparar ahora_ por tipo.

Además, el agente aplica el protocolo circadiano al cambiar de fase: **noche** a partir de las 22:00, **activación matinal** a partir de las 06:00 y **ambiente diurno** a partir de las 10:00.

### Voz y texto

`useVoice()` usa la Web Speech API y responde con `speechSynthesis`. Solo se activa con un clic y todo va en `try/catch`. Si no hay micrófono, la **caja de texto** hace exactamente lo mismo: voz y texto llegan al agente como el mismo evento.

Quién responde depende del «cerebro» elegido en el panel _Agente_:

- **Agente de IA (Gemini)**: entiende lenguaje natural en el idioma de la interfaz, peticiones abiertas («la 203 no consigue dormir»), cambios relativos, varias habitaciones a la vez y el hilo de la conversación («y ahora un poco menos»). Pregunta cuando falta un dato.
- **Motor local** (`core/voice`): intérprete por reglas, sin red y solo en castellano; entiende números en palabras y pide una aclaración corta cuando no entiende. Es también el respaldo si la IA no está disponible.

Ejemplos que entienden los dos:

> «abre la habitación 205» · «sube la temperatura a veintitrés» · «baja la luz al 20 por ciento» · «luz más cálida» · «pon el protocolo de noche» · «activa el modo IA» · «desactiva el aroma» · «pon sonido de lluvia» · «programa la medicación a las 14:00 en la 202» · «avisa a enfermería» · «qué estado tiene la 203»

Si no indicas habitación, se usa la que está abierta.

> Nota de privacidad: la aplicación no graba ni envía audio (al agente de IA solo le llega el texto reconocido). Sin embargo, algunos navegadores (por ejemplo, Chrome) hacen el reconocimiento de voz con un servicio en la nube del propio navegador. Si eso no es aceptable, usa la caja de texto.

### Agente de IA y motor local

```ts
interface Planner {
  // motor local: planifica, no ejecuta
  plan(ctx: AgentContext): Promise<ToolCall[]>;
}
interface ConversationalPlanner {
  // agente de IA: ejecuta y ve los resultados
  converse(ctx: AgentContext, exec: ToolExecutor): Promise<AgentTurn>;
}
interface LlmProvider {
  complete(req: { system; messages; tools }): Promise<{ toolCalls; text?; content? }>;
}
```

- **MockPlanner**: el motor de políticas de `core/policy/engine.ts`. Atiende **siempre** los disparadores, el reloj, el ruido y las alarmas, y las órdenes de voz/texto cuando la IA no está activa.
- **LlmPlanner** (agente de IA): atiende **solo las órdenes de voz o texto**. Es un bucle acotado: el modelo propone llamadas → `runTool` las valida y ejecuta → el resultado vuelve al modelo como `tool_result` → el modelo sigue o responde. Así puede corregir un argumento inválido, explicar un rechazo por prioridad o alergia y encadenar pasos.
- **Garantías que no dependen del modelo**: la prioridad la fija el evento (una orden es prioridad 2; el modelo no puede escalar a seguridad); todo pasa por `runTool` (rangos, categoría, alergia, prioridades); el modelo no recibe datos clínicos ni las funciones `classify_patient` / `clear_patient`.
- **Caída al motor local**: si la IA falla antes de ejecutar nada (sin clave, sin red, rechazo), responde el intérprete local y queda registrado como `planner_fallback`. Si falla a mitad, no se repite nada: el agente cuenta lo que hizo y por qué se paró.
- La API key vive solo en el backend (`server/agentProxy.ts`), que fija el modelo y los parámetros.

👉 Arquitectura, despliegue y lista de comprobación de seguridad en **[docs/LLM.md](docs/LLM.md)**.

### i18n y accesibilidad

- Todos los textos de la interfaz están en `src/i18n/` (es/ca/en, con el selector en la cabecera). TypeScript exige que `ca.ts` y `en.ts` tengan todas las claves. El intérprete local de órdenes solo funciona en castellano; el agente de IA responde en el idioma de la interfaz.
- Se puede usar entero con teclado: habitaciones del plano con Tab y Enter, pestañas con flechas, interruptores `role="switch"`, sliders con `aria-valuetext` y regiones `aria-live` para la conversación y los avisos. Incluye enlace «saltar al contenido», contraste AA y respeta `prefers-reduced-motion`. El diseño es responsive.

## Escenarios manuales de prueba

1. **Un ajuste manual desactiva el Modo IA.** Abre la 202 y mueve el slider de luz. El interruptor _Modo IA_ se apaga, el registro muestra «Modo IA desactivado» y el plano marca la sala como MANUAL. Vuelve a activarlo: se libera la orden manual y el agente reaplica el protocolo de la hora.
2. **La cura restablece al terminar.** Abre la 205 y pulsa _Simular → Cura (15 min)_. La luz sube con rampa a 100 % y 4000 K, y el sonido y el aroma se apagan. Pon 60× y, a los 15 min simulados, el registro muestra «Fin de «Cura»» y la sala vuelve gradualmente a sus valores previos.
3. **A las 06:00 el agente aplica la activación matinal.** En la cabecera, _Ir a_ `06:00` (o deja correr el reloj a 600×). Las salas en Modo IA pasan a «Mañana» con el motivo «Activación matinal…», personalizada por categoría: A suave y cálida, B y C luz fría intensa.
4. **Sin micrófono funciona la caja de texto.** En un navegador sin Web Speech API (por ejemplo, Firefox) o si niegas el permiso, aparece el aviso y la caja de texto ejecuta las mismas órdenes, como «baja la luz al 20 por ciento».

Otros escenarios útiles:

- **Prioridades.** Durante una cura programada (prioridad 3), pulsa _Pico de ruido_: la acción terapéutica se rechaza y el registro explica por qué.
- **Alarma clínica.** _Simular → Alarma clínica_ pone luz de trabajo **al instante** (sin rampa), silencio, sin aroma y aviso de urgencia alta. A los 10 min vuelve al estado previo.
- **Alergia.** En _Paciente_, carga el _Perfil C_ (alergia a cítricos) y clasifica: el aroma queda bloqueado en el menú y cualquier intento de encenderlo se rechaza.
- **Disparadores.** Pon 60× a las 08:20: a las 08:30 salta el desayuno, una sola vez.

## Pruebas automáticas

`npm test` ejecuta 91 pruebas:

- `priorities.test.ts`: jerarquía de prioridades, rechazos registrados, ajuste manual ⇒ Modo IA desactivado, rampas sin saltos.
- `clamp.test.ts`: recorte a rangos del dispositivo y de la categoría, rangos clínicos de la cura, argumentos inválidos (nunca lanza), JSON Schema con `minimum`/`maximum`.
- `allergy.test.ts`: con alergia, el aroma nunca se activa en ningún protocolo, prioridad, rampa ni retorno.
- `classify.test.ts`: 3 perfiles de ejemplo → A, B y C; determinismo; borrado de datos.
- `scheduler.test.ts`: una vez por ventana, saltos de reloj, medianoche, «once»; comida, 06:00, restablecimiento tras la cura y descanso hasta las 06:00 con el motor completo.
- `interpreter.test.ts`: más de 20 frases, números en palabras, horas habladas, órdenes compuestas y aclaraciones.
- `planner.test.ts`: bucle del agente de IA con un proveedor guionizado (prioridad del evento, `tool_result`, corrección de llamadas inválidas, límite de pasos), caída al motor local, contexto sin datos clínicos, funciones de paciente vetadas, eventos que nunca se delegan y `BackendProvider` contra un backend simulado.
- `server/agentProxy.test.ts`: el backend fija modelo y parámetros, rechaza otros orígenes y cuerpos mal formados, no expone la clave, limita la frecuencia y traduce bien al formato de Gemini (firmas de razonamiento intactas, resultados agrupados, bloqueos de seguridad).
- `i18n.test.ts`: paridad de claves es/ca/en y claves dinámicas.

## Privacidad

- Ningún dato se guarda: no hay `localStorage`, `sessionStorage`, cookies ni base de datos.
- Con el **motor local** no hay ninguna llamada de red en tiempo de ejecución.
- Con el **agente de IA**, cada orden envía a Google (API de Gemini), a través del backend propio, el texto de la orden, la conversación reciente y el estado ambiental de las habitaciones (categoría A/B/C, protocolo y valores). **Nunca** se envía el formulario del paciente, y el modelo no puede clasificar ni borrar pacientes. El backend no registra el cuerpo de las peticiones. Ojo: con el nivel gratuito de la API de Gemini, Google puede usar el contenido enviado para mejorar sus productos; para datos reales usa una cuenta de pago y revisa sus condiciones.
- La API key no está en el código ni en el bundle: se lee de `.env.local` (ignorado por git) solo en el servidor.
- El estado vive en un store Zustand en memoria y se pierde al recargar la página.
