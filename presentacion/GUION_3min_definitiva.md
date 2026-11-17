# Guion · NeumaCare en 3 minutos (versión definitiva)

**Público:** jurado profesional y personas de la empresa cliente.
**Formato:** 9 diapositivas · unas 350 palabras · entre 2 min 30 s (140 palabras por minuto) y 2 min 48 s (125). Quedan unos 10–30 s de margen para las animaciones y las pausas.
El mismo texto está en las **notas del orador** de los dos archivos `.pptx`.

> Hecho con el código actual (commit «actualización»): incluye el **panel del paciente**, la **vista hospital** con avisos a enfermería y el **ingreso de pacientes por voz** en local.

| # | Diapositiva | Tiempo | Qué señalar en pantalla |
|---|---|---|---|
| 1 | Portada | 0:00–0:14 | Los elementos entran solos. Empieza a hablar con el título. |
| 2 | Problema | 0:14–0:42 | Tres tarjetas, una a una: entorno genérico, carga manual, confianza. |
| 3 | Solución | 0:42–1:01 | Las tres piezas y las tres etiquetas de abajo: para quién, qué es y qué no es. |
| 4 | Habitación 3D | 1:01–1:20 | Luz al 100 %, silencio y la cama limitada de 0° a 45°. |
| 5 | Paciente y enfermería | 1:20–1:42 | El panel con botones grandes, el aviso «Alta» y el mensaje de alcance. |
| 6 | Perfil A/B/C | 1:42–2:01 | Los pesos A 1,70 · B 0,60 · C 7,10 y la alergia a aromas. |
| 7 | Prioridades | 2:01–2:22 | La escalera 1→6 y la fila roja del registro (sonido bloqueado). |
| 8 | IA con límites | 2:22–2:48 | El chat con la IA y el ingreso en local («datos no guardados»). |
| 9 | Cierre | 2:48–3:00 | 143 · 3 · 14, siguiente paso y pregunta final. |

---

## 1 · Portada (0:00–0:14)
Buenos días. Somos el equipo de NeumaCare y os presentamos una habitación de hospital que se adapta sola a cada paciente. Todo lo que vais a ver es una simulación funcionando, no una maqueta.

## 2 · Problema (0:14–0:42)
El problema: cada paciente es distinto, pero la luz, el ruido y la temperatura de su habitación son iguales para todos, y es el personal quien los ajusta a mano entre comidas, medicación y curas. Y en sanidad, la IA solo vale si es segura y respeta la privacidad. Queremos personalizar cada habitación sin añadir trabajo al equipo.

## 3 · Solución (0:42–1:01)
NeumaCare es una aplicación web para pacientes, enfermería y gestión del hospital: un plano en tiempo real de la planta, una vista 3D de cada habitación y un agente de IA al que se le habla en lenguaje natural.

## 4 · Habitación 3D (1:01–1:20)
En la habitación 205, en modo cura, la luz sube al cien por cien, el sonido y el aroma se apagan, y la cama queda limitada al rango que permite la lesión del paciente: de cero a cuarenta y cinco grados.

## 5 · Paciente y enfermería (1:20–1:42)
El paciente tiene su propio panel, con botones grandes, voz o texto. Si pulsa «necesito ayuda urgente», el aviso llega a enfermería. Y solo puede cambiar su habitación: si pide algo de otra, el sistema lo rechaza.

## 6 · Perfil A/B/C (1:42–2:01)
Cada ingreso se clasifica en A, B o C con un clasificador que explica el porqué, punto por punto. Y manda la seguridad: con alergia a aromas, el difusor queda bloqueado siempre.

## 7 · Prioridades (2:01–2:22)
Si varias necesidades chocan, decide una jerarquía de seis prioridades: primero la seguridad clínica, después las órdenes manuales, luego los procedimientos. Aquí, durante una cura, un pico de ruido se rechaza y queda anotado el motivo.

## 8 · IA con límites (2:22–2:48)
La IA solo actúa llamando a catorce funciones validadas. Le decimos «la 203 no consigue dormir» y aplica el protocolo de calma. El ingreso de un paciente se resuelve siempre en local y no se guarda en la conversación. Y si la IA falla, sigue un motor local.

## 9 · Cierre (2:48–3:00)
Hay 143 pruebas automáticas superadas. El siguiente paso es un piloto con dispositivos reales y personal clínico. Gracias; estamos a vuestra disposición para las preguntas.

---

## Preguntas probables del jurado

- **¿Qué pasa si la IA falla o no hay red?** Responde el motor local por reglas (queda como `planner_fallback`). Los disparadores, el reloj y las alarmas siempre los resuelve el motor local, sin IA.
- **¿Qué datos salen hacia Google?** Solo el texto de la orden, la conversación reciente y el estado ambiental de las salas (categoría, protocolo y valores). Nunca el formulario del paciente, y el ingreso por voz se resuelve en local (`docs/LLM.md`).
- **¿Puede la IA saltarse la seguridad?** No. La prioridad la fija el evento, no el modelo, y todo pasa por `runTool`, que valida rangos, prioridades y alergias. De las 18 funciones, al modelo no se le ofrecen `speak`, `admit_patient`, `classify_patient` ni `clear_patient`.
- **¿Qué puede hacer un paciente?** Solo cambiar los ajustes de su propia habitación y llamar a enfermería. No ve a otros pacientes ni el registro del agente.
- **¿Qué ve el hospital?** La vista hospital (`#/hospital`) oculta registros e historial y muestra los avisos a enfermería.
- **¿Es real?** No: es una simulación, sin sensores ni datos de pacientes reales. Los pacientes de la demostración son de ejemplo.
- **¿Cómo sabéis que funciona?** 143 pruebas automáticas (`npm test`), tipado estricto (`npm run typecheck`) y lint sin avisos.

## Si hacéis demo en directo

1. `npm run dev` y abrid `http://localhost:5173`.
2. Rutas: `#/` administración · `#/hospital` vista hospital · `#/paciente/205` panel del paciente.
3. Para el agente de IA hace falta `GEMINI_API_KEY` en `.env.local`. Sin clave funciona igual con el motor local.
4. Para enseñar el ingreso por voz o el rechazo por alcance sin enviar nada a Google, elegid «Motor de políticas (local)» en el panel Agente.
5. Todo vive en memoria: al recargar la página se pierde el estado.
