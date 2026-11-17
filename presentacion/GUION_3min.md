# Guion · NeumaCare en 3 minutos

**Público:** jurado profesional y personal de la empresa cliente.
**Formato:** 9 diapositivas · unas 406 palabras · 2 min 54 s a 140 palabras por minuto (3 min 7 s a 130).
El mismo texto está en las **notas del orador** de `NeumaCare_presentacion.pptx`.

> Consejo: ensaya con cronómetro. Si vas justo de tiempo, recorta la diapositiva 8 (día y noche) a una sola frase.

| # | Diapositiva | Tiempo | Qué hacer en pantalla |
|---|---|---|---|
| 1 | Portada | 0:00–0:15 | Los elementos entran solos, en orden. Empieza a hablar al aparecer el título. |
| 2 | Problema | 0:15–0:44 | Tres tarjetas aparecen una a una; di cada idea cuando entre. |
| 3 | Solución | 0:44–1:02 | Las tres piezas entran en orden y al final el plano de la planta. |
| 4 | Habitación 3D | 1:02–1:21 | Señala la luz al 100 %, el silencio y el límite de la cama. |
| 5 | Perfil A/B/C | 1:21–1:43 | Señala los pesos de la clasificación (A 1,70 · B 0,60 · C 7,10). |
| 6 | Prioridades | 1:43–2:05 | Recorre la escalera 1→6 y termina en la fila roja del registro. |
| 7 | IA con garantías | 2:05–2:27 | Lee la orden del chat y señala las dos funciones ejecutadas. |
| 8 | Día y noche | 2:27–2:40 | Compara los dos planos: amarillo de día, violeta de noche. |
| 9 | Cierre | 2:40–2:55 | Cifras, siguiente paso y pregunta final. Deja 5 s de margen. |

---

## 1 · Portada (0:00–0:15)
Buenos días. Somos el equipo de NeumaCare y venimos a presentaros una habitación de hospital que se adapta sola a cada paciente. Todo lo que vais a ver es una simulación funcionando, no una maqueta.

## 2 · Problema (0:15–0:44)
El problema es doble. Cada paciente es distinto, pero la luz, el ruido y la temperatura de su habitación son los mismos para todos y a cualquier hora. Y el personal tiene que ajustarlo todo a mano, entre comidas, medicación y curas. Además, en sanidad la IA solo vale si es segura, trazable y respeta la privacidad. Nuestro objetivo: personalizar cada habitación sin añadir trabajo al equipo.

## 3 · Solución (0:44–1:02)
NeumaCare es un panel de planta con tres piezas: un plano en tiempo real de las diez habitaciones, una vista 3D de cada habitación, y un agente de IA al que se le habla o se le escribe en lenguaje natural.

## 4 · Habitación 3D (1:02–1:21)
Abrimos la habitación 205. Se pueden ajustar luz, persiana, cama, sonido y aroma. Aquí está en modo cura: luz de trabajo al cien por cien, silencio, y la cama limitada al rango que permite la lesión del paciente, entre cero y cuarenta y cinco grados.

## 5 · Perfil A/B/C (1:21–1:43)
Cada ingreso se clasifica en categoría A, B o C con un clasificador determinista que explica el porqué, punto por punto: mirad los pesos. A, calma y confort. B, descanso y orientación. C, activación y recuperación. Y las reglas de seguridad mandan: con alergia a aromas, el difusor queda bloqueado siempre.

## 6 · Prioridades (1:43–2:05)
Cuando varias necesidades chocan, decide una jerarquía de seis prioridades: primero la seguridad clínica, después las órdenes manuales, luego los procedimientos. En el registro veis un ejemplo: durante una cura, un pico de ruido se rechaza y queda anotado el motivo. Al terminar, la sala vuelve gradualmente a su estado anterior.

## 7 · IA con garantías (2:05–2:27)
La IA, con Gemini, no toca la sala libremente: solo llama a catorce funciones validadas que comprueban rangos, prioridades y alergias, y no puede tocar los datos del paciente. Le decimos «la 203 no consigue dormir» y aplica el protocolo de calma. Si la IA falla, un motor local sigue funcionando.

## 8 · Día y noche (2:27–2:40)
Y todo sigue el reloj: por la mañana, ambiente activo; a partir de las diez de la noche, la planta pasa sola a modo noche, con luz mínima y silencio.

## 9 · Cierre (2:40–2:55)
Tenemos 138 pruebas automáticas superadas y una IA que nunca recibe el formulario del paciente. El siguiente paso es un piloto con dispositivos reales y personal clínico. Gracias; quedamos a vuestra disposición para las preguntas.

---

## Posibles preguntas del jurado (y de dónde sale la respuesta)

- **¿Qué pasa si la IA falla o no hay red?** Responde el motor local por reglas; queda registrado como `planner_fallback`. Los disparadores, el reloj y las alarmas siempre los resuelve el motor local, sin IA.
- **¿Qué datos salen hacia Google?** Solo el texto de la orden, la conversación reciente y el estado ambiental de las salas (categoría, protocolo y valores). Nunca el formulario del paciente. La clave vive solo en el servidor (`docs/LLM.md`).
- **¿Puede la IA saltarse la seguridad?** No. La prioridad la fija el evento, no el modelo; todo pasa por `runTool`, que valida rangos, prioridades y alergias. Las funciones de admitir, clasificar y borrar pacientes no se le ofrecen.
- **¿Es real?** No: es una simulación, sin sensores ni datos de pacientes reales. Los tres pacientes de la demostración son de ejemplo.
- **¿Cómo sabéis que funciona?** 138 pruebas automáticas (`npm test`) y tipado estricto (`npm run typecheck`).

## Antes de presentar

1. **Abre el PowerPoint en la presentación en pantalla completa** (F5) y prueba las animaciones: se han generado por código y no se han podido verificar en PowerPoint real.
2. Si vas a hacer demo en directo: `npm run dev` y abre `http://localhost:5173`. Para el agente de IA hace falta `GEMINI_API_KEY` en `.env.local`.
3. Revisa que el problema de la diapositiva 2 encaja con el cliente. Está redactado de forma general y conviene ajustarlo con sus datos reales.
