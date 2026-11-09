import { t } from '../../i18n';
import type { LlmProvider, Msg } from '../llm/types';
import { isOverrideActive } from '../policy/priorities';
import { isDeterministicOnly, priorityForEvent } from '../policy/engine';
import { toToolDefinitions, validateToolCall } from '../tools';
import { formatHHmm, phaseAt } from '../time';
import type { ToolCall } from '../types';
import type { AgentContext, Planner } from './types';

export class LlmPlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmPlannerError';
  }
}

/** Prompt del sistema: rol, reglas no negociables y jerarquía de prioridades. */
export function buildSystemPrompt(): string {
  return [
    'Eres el agente ambiental de NeumaCare, una planta hospitalaria SIMULADA (sin sensores ni dispositivos reales).',
    'Solo puedes actuar llamando a las funciones disponibles. No inventes funciones ni argumentos.',
    'Jerarquía de prioridades (una menor nunca anula a una mayor):',
    '1) seguridad clínica y alarmas; 2) orden manual del personal o del paciente; 3) procedimientos programados (cura, medicación, comida);',
    '4) protección del sueño; 5) intención terapéutica inferida; 6) neutro.',
    'Reglas: respeta los rangos de la categoría del paciente; si hay alergia a aromas, nunca enciendas el difusor;',
    'los cambios se aplican con rampa; al terminar un evento usa restoreOnEnd para volver al estado previo;',
    'confirma brevemente con "speak" en castellano y pide aclaración si la orden es ambigua.',
    'No pidas ni repitas datos clínicos del formulario del paciente.',
  ].join('\n');
}

/** Contexto compacto del estado (sin datos clínicos del formulario). */
export function buildContextSummary(ctx: AgentContext): Record<string, unknown> {
  const { state, nowMin } = ctx;
  return {
    hora: formatHHmm(nowMin),
    fase: phaseAt(nowMin),
    habitacionSeleccionada: state.ui.selectedRoom,
    habitaciones: state.roomIds
      .map((id) => state.rooms[id])
      .filter((r) => r?.occupied)
      .map((r) => ({
        id: r?.id,
        categoria: r?.category,
        protocolo: r?.protocol,
        modoIA: r?.auto,
        valores: r?.target ?? r?.values,
        eventoActivo:
          r && isOverrideActive(r.override, nowMin)
            ? { etiqueta: r.override.label, prioridad: r.override.priority }
            : null,
      })),
    disparadores: state.triggers.map((tr) => ({
      id: tr.id,
      tipo: tr.type,
      sala: tr.roomId,
      hora: tr.time,
      activo: tr.enabled,
    })),
    eventosRecientes: state.agent.calls.slice(0, 8).map((c) => ({
      hora: formatHHmm(c.atMin),
      funcion: c.call.name,
      ok: c.result.ok,
    })),
  };
}

export function buildMessages(ctx: AgentContext): Msg[] {
  return [
    {
      role: 'user',
      content: JSON.stringify({
        evento: { tipo: ctx.event.kind, datos: ctx.event.payload },
        contexto: buildContextSummary(ctx),
      }),
    },
  ];
}

/**
 * Esqueleto del planner con LLM. Construye prompt + contexto, pide al proveedor
 * llamadas a funciones, valida cada una con Zod y les asigna la prioridad del evento.
 * Cualquier fallo se propaga para que el agente caiga al MockPlanner.
 */
export class LlmPlanner implements Planner {
  readonly kind = 'llm' as const;

  constructor(private readonly provider: LlmProvider) {}

  async plan(ctx: AgentContext): Promise<ToolCall[]> {
    if (isDeterministicOnly(ctx.event)) throw new LlmPlannerError(t('llm.deterministicOnly'));
    const response = await this.provider.complete({
      system: buildSystemPrompt(),
      messages: buildMessages(ctx),
      tools: toToolDefinitions(),
    });
    const priority = priorityForEvent(ctx.event, ctx.state);
    return response.toolCalls.map((call, i) => {
      const check = validateToolCall(call);
      if (!check.ok) {
        throw new LlmPlannerError(t('llm.invalidCall', { name: call.name, error: check.error }));
      }
      return {
        id: call.id || `${ctx.event.id}-llm-${i + 1}`,
        name: call.name,
        args: call.args,
        priority,
        source: 'llm',
        eventId: ctx.event.id,
        reason: response.text ? `LLM: ${response.text}` : t('reason.llm'),
      };
    });
  }
}
