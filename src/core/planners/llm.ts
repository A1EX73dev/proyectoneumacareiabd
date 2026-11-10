import { t } from '../../i18n';
import type { ContentBlock, LlmProvider, LlmResponse, Msg } from '../llm/types';
import { isOverrideActive } from '../policy/priorities';
import { isLlmEvent, priorityForEvent } from '../policy/engine';
import { toToolDefinitions, type ToolDef } from '../tools';
import { formatHHmm, phaseAt } from '../time';
import type { EnvValues, ToolCall, ToolResult } from '../types';
import type { AgentContext, AgentTurn, ConversationalPlanner, ToolExecutor } from './types';

export class LlmPlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmPlannerError';
  }
}

/** Vueltas máximas modelo → funciones → modelo por cada orden. */
export const MAX_AGENT_STEPS = 6;

/**
 * Funciones que el agente de IA no recibe:
 * - `speak`: su respuesta final ya se dice y se muestra en la conversación.
 * - `classify_patient` y `clear_patient`: los datos clínicos del paciente solo se tocan
 *   desde el formulario de la interfaz, nunca a través del modelo.
 */
export const LLM_EXCLUDED_TOOLS: readonly string[] = ['speak', 'classify_patient', 'clear_patient'];

export function llmToolDefinitions(): ToolDef[] {
  return toToolDefinitions().filter((def) => !LLM_EXCLUDED_TOOLS.includes(def.name));
}

/** Prompt del sistema. Es fijo (se cachea): todo lo que cambia va en el mensaje del usuario. */
export function buildSystemPrompt(): string {
  return `Eres el asistente de planta de NeumaCare. Gestionas el ambiente (temperatura, luz, sonido, aroma y protocolos) y la agenda de disparadores de las habitaciones 201 a 210 de una planta hospitalaria SIMULADA, sin sensores ni dispositivos reales. Te habla el personal sanitario o los pacientes, por voz o por texto.

Cada mensaje del usuario es un JSON con "orden" (lo que han dicho o escrito) y "contexto": hora simulada, habitación abierta en pantalla, estado de cada habitación, agenda de disparadores, conversación reciente e idioma de la interfaz.

Cómo actuar
- Todo cambio se hace llamando a las funciones. No afirmes haber hecho algo que no hayas ejecutado, y básate en el resultado de cada función: el sistema puede recortar un valor a los rangos de la categoría del paciente o rechazar la acción (por alergia a aromas, o porque hay en curso un evento de mayor prioridad, como una cura o una alarma). Si ocurre, explícalo en una frase en lugar de insistir.
- Jerarquía de prioridades, que el sistema aplica por ti (una menor nunca anula a una mayor): 1) seguridad clínica y alarmas; 2) orden manual del personal o del paciente, que es la tuya; 3) procedimientos programados (cura, medicación, comida); 4) protección del sueño; 5) intención terapéutica; 6) neutro.
- Si la orden no nombra habitación, usa la habitación abierta. Si no hay ninguna abierta y hace falta una, pregunta cuál. "Todas" significa las habitaciones ocupadas: llama a la función una vez por habitación, en paralelo.
- Para cambios relativos ("un poco más de luz", "más cálida") parte de los valores actuales del contexto. La transcripción de voz puede traer errores ("la dos cero cinco", "veintitrés grados"): interprétala con sentido común.
- Ante una petición abierta ("la 203 no consigue dormir") combina las funciones que mejor la resuelvan. Si la petición es de verdad ambigua o falta un dato imprescindible (por ejemplo, la hora de un disparador), pregunta antes de actuar en vez de adivinar.
- Para cancelar un disparador necesitas su id: está en contexto.disparadores.
- Los eventos temporales (una cura, una visita) llevan durationMin y restoreOnEnd: true, para que la sala vuelva sola al estado anterior al terminar.
- Un ajuste tuyo del ambiente desactiva el Modo IA de esa sala (deja de seguir el ritmo circadiano automático) hasta que alguien lo reactive. Menciónalo solo si viene al caso.

Límites
- No das consejo médico ni decides sobre tratamientos. Si alguien describe un problema de salud o pide ayuda, avisa a enfermería con notify_staff (urgencia "alta" si parece urgente) y dilo.
- Las alarmas clínicas las gestiona un sistema determinista aparte: no puedes anularlas.
- No tienes datos clínicos de los pacientes ni debes pedirlos.

Cómo responder
- Al terminar, responde con una o dos frases en el idioma de contexto.idioma ("es" castellano, "ca" catalán, "en" inglés), confirmando lo hecho con los valores reales que han devuelto las funciones.
- La respuesta puede leerse en voz alta: texto llano, sin markdown, listas ni emojis.`;
}

function roundValues(v: EnvValues): EnvValues {
  return {
    ...v,
    tempC: Math.round(v.tempC * 10) / 10,
    lightPct: Math.round(v.lightPct),
    kelvin: Math.round(v.kelvin),
    soundPct: Math.round(v.soundPct),
    aromaPct: Math.round(v.aromaPct),
  };
}

/** Contexto compacto del estado (sin datos clínicos del formulario). */
export function buildContextSummary(ctx: AgentContext): Record<string, unknown> {
  const { state, nowMin, event } = ctx;
  // La orden actual ya está en la conversación: aquí solo va lo anterior.
  const history = state.agent.conversation;
  const last = history[history.length - 1];
  const previous =
    last?.who === 'user' && last.text === event.payload.text ? history.slice(0, -1) : history;
  return {
    hora: formatHHmm(nowMin),
    fase: phaseAt(nowMin),
    idioma: state.ui.lang,
    habitacionAbierta: state.ui.selectedRoom,
    habitaciones: state.roomIds.map((id) => {
      const r = state.rooms[id];
      if (!r?.occupied) return { id, ocupada: false };
      return {
        id,
        ocupada: true,
        categoria: r.category,
        protocolo: r.protocol,
        modoIA: r.auto,
        valores: roundValues(r.target ?? r.values),
        eventoActivo: isOverrideActive(r.override, nowMin)
          ? {
              etiqueta: r.override.label,
              prioridad: r.override.priority,
              termina: r.override.endMin === null ? null : formatHHmm(r.override.endMin),
            }
          : null,
      };
    }),
    disparadores: state.triggers.map((tr) => ({
      id: tr.id,
      tipo: tr.type,
      sala: tr.roomId,
      hora: tr.time,
      activo: tr.enabled,
    })),
    conversacionReciente: previous.slice(-8).map((item) => ({
      quien: item.who === 'user' ? 'usuario' : 'asistente',
      texto: item.text,
    })),
  };
}

export function buildMessages(ctx: AgentContext): Msg[] {
  return [
    {
      role: 'user',
      content: JSON.stringify({
        orden: String(ctx.event.payload.text ?? ''),
        contexto: buildContextSummary(ctx),
      }),
    },
  ];
}

/** Turno del asistente tal cual llegó; si el proveedor no lo conserva, se reconstruye. */
function assistantContent(response: LlmResponse): ContentBlock[] {
  if (response.content) return response.content;
  return [
    ...(response.text ? [{ type: 'text', text: response.text }] : []),
    ...response.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args })),
  ];
}

/**
 * Agente de IA: un bucle acotado modelo → funciones → modelo. El modelo propone llamadas,
 * `exec` (runTool) las valida y ejecuta, y el resultado vuelve al modelo como `tool_result`
 * para que pueda corregir, encadenar pasos o explicar un rechazo. La prioridad de cada
 * llamada la fija el evento, nunca el modelo.
 */
export class LlmPlanner implements ConversationalPlanner {
  readonly kind = 'llm' as const;

  constructor(private readonly provider: LlmProvider) {}

  async converse(ctx: AgentContext, exec: ToolExecutor): Promise<AgentTurn> {
    if (!isLlmEvent(ctx.event)) throw new LlmPlannerError(t('llm.deterministicOnly'));

    const system = buildSystemPrompt();
    const tools = llmToolDefinitions();
    const allowed = new Set(tools.map((def) => def.name));
    const priority = priorityForEvent(ctx.event, ctx.state);
    const reason = t('reason.llm', { text: String(ctx.event.payload.text ?? '') });
    // El historial solo crece: los turnos anteriores nunca se editan ni se reordenan.
    const messages: Msg[] = buildMessages(ctx);
    const calls: ToolCall[] = [];
    const results: ToolResult[] = [];

    for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
      let response: LlmResponse;
      try {
        response = await this.provider.complete({ system, messages, tools });
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        if (calls.length === 0) throw error;
        return { calls, results, reply: null, error };
      }
      if (response.toolCalls.length === 0) {
        return { calls, results, reply: response.text ?? null };
      }

      messages.push({ role: 'assistant', content: assistantContent(response) });
      // Todos los resultados de un turno vuelven juntos en un único mensaje.
      const toolResults: ContentBlock[] = response.toolCalls.map((proposed) => {
        const call: ToolCall = {
          id: proposed.id || `${ctx.event.id}-llm-${calls.length + 1}`,
          name: proposed.name,
          args: proposed.args,
          priority,
          source: 'llm',
          eventId: ctx.event.id,
          reason,
        };
        const result: ToolResult = allowed.has(call.name)
          ? exec(call)
          : { ok: false, error: t('tool.unknown', { name: call.name }) };
        calls.push(call);
        results.push(result);
        return {
          type: 'tool_result',
          tool_use_id: proposed.id,
          content: JSON.stringify(result.ok ? result.result : { error: result.error }),
          is_error: !result.ok,
        };
      });
      messages.push({ role: 'user', content: toolResults });
    }

    return { calls, results, reply: null, error: new LlmPlannerError(t('llm.tooManySteps')) };
  }
}
