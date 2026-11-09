import { zodToJsonSchema } from 'zod-to-json-schema';
import { t, tk } from '../../i18n';
import { newId } from '../ids';
import { checkPriority } from '../policy/priorities';
import { appStore, patchRoom, pushCall, withLog, type AppStore } from '../state';
import { PRIORITY, type Range, type ToolCall, type ToolResult } from '../types';
import { applyProtocol } from './apply_protocol';
import { cancelTrigger } from './cancel_trigger';
import { classifyPatient } from './classify_patient';
import { clearPatient } from './clear_patient';
import { getRoomState } from './get_room_state';
import { listTriggers } from './list_triggers';
import { notifyStaff } from './notify_staff';
import { openRoom } from './open_room';
import { scheduleTrigger } from './schedule_trigger';
import { setAroma } from './set_aroma';
import { setAutoMode } from './set_auto_mode';
import { setLight } from './set_light';
import { setSound } from './set_sound';
import { setTemperature } from './set_temperature';
import { speak } from './speak';
import { fail, type ToolContext, type ToolSpec } from './types';

export type { ToolContext, ToolSpec } from './types';

/** Registro único de funciones del agente. */
export const TOOLS: ToolSpec[] = [
  setTemperature,
  setLight,
  setSound,
  setAroma,
  applyProtocol,
  setAutoMode,
  classifyPatient,
  clearPatient,
  scheduleTrigger,
  cancelTrigger,
  listTriggers,
  notifyStaff,
  getRoomState,
  openRoom,
  speak,
];

const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.name, tool]));

export const TOOL_NAMES = TOOLS.map((tool) => tool.name);

export function getTool(name: string): ToolSpec | undefined {
  return TOOL_MAP.get(name);
}

/* ------------------------------------------------------------------ */
/* JSON Schema para el LLM                                              */
/* ------------------------------------------------------------------ */

export type JsonSchema = Record<string, unknown>;

/** Formato de herramienta de Anthropic Messages API (`tools: [{ name, description, input_schema }]`). */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

/** Formato de OpenAI Chat Completions (`tools: [{ type: 'function', function: {...} }]`). */
export interface OpenAiToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: JsonSchema };
}

function addRanges(schema: JsonSchema, ranges?: Readonly<Record<string, Range>>): JsonSchema {
  const properties = schema.properties as Record<string, JsonSchema> | undefined;
  if (!ranges || !properties) return schema;
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const prop = properties[key];
    if (prop) properties[key] = { ...prop, minimum: min, maximum: max };
  }
  return schema;
}

export function toToolDefinitions(): ToolDef[] {
  return TOOLS.map((tool) => {
    const schema = zodToJsonSchema(tool.schema, { $refStrategy: 'none' }) as JsonSchema;
    delete schema.$schema;
    return {
      name: tool.name,
      description: tool.description,
      input_schema: addRanges(schema, tool.ranges),
    };
  });
}

export function toOpenAiTools(): OpenAiToolDef[] {
  return toToolDefinitions().map((def) => ({
    type: 'function',
    function: { name: def.name, description: def.description, parameters: def.input_schema },
  }));
}

/* ------------------------------------------------------------------ */
/* Validación y ejecución                                               */
/* ------------------------------------------------------------------ */

export function validateToolCall(call: Pick<ToolCall, 'name' | 'args'>): ToolResult {
  const tool = getTool(call.name);
  if (!tool) return fail(t('tool.unknown', { name: call.name }));
  const parsed = tool.schema.safeParse(call.args ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '·'}: ${i.message}`)
      .join('; ');
    return fail(t('tool.invalid', { name: call.name, issues }));
  }
  return { ok: true, result: parsed.data };
}

function clampArgs(
  args: unknown,
  ranges?: Readonly<Record<string, Range>>,
): { args: unknown; notes: string[] } {
  if (!ranges || typeof args !== 'object' || args === null) return { args, notes: [] };
  const out: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  const notes: string[] = [];
  for (const [key, [lo, hi]] of Object.entries(ranges)) {
    const value = out[key];
    if (typeof value !== 'number') continue;
    const clamped = Math.min(hi, Math.max(lo, value));
    if (clamped !== value) {
      notes.push(t('tool.clamped', { key, from: value, to: clamped }));
      out[key] = clamped;
    }
  }
  return { args: out, notes };
}

function compactArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([key, value]) => key !== 'room' && key !== 'form' && value !== undefined)
    .map(([key, value]) => {
      if (typeof value === 'object' && value !== null) return `${key}=…`;
      const text = String(value);
      return `${key}=${text.length > 40 ? `${text.slice(0, 40)}…` : text}`;
    })
    .join(' · ');
}

export function describeCall(call: Pick<ToolCall, 'name' | 'args'>): string {
  const detail = compactArgs(call.args ?? {});
  return detail ? `${tk('tool', call.name)} (${detail})` : tk('tool', call.name);
}

/**
 * Punto único de ejecución: valida (Zod) → recorta rangos → comprueba prioridades →
 * ejecuta → registra con motivo. Nunca lanza: devuelve `{ok, result}` o `{ok:false, error}`.
 */
export function runTool(call: ToolCall, store: AppStore = appStore): ToolResult {
  const state = store.getState();
  const nowMin = state.clock.nowMin;
  const priority = call.priority ?? PRIORITY.THERAPEUTIC;
  const source = call.source ?? 'agent';
  const reason = call.reason ?? t('reason.none');
  const eventId = call.eventId ?? call.id;
  const tool = getTool(call.name);
  let roomId: string | null = null;
  let result: ToolResult;

  try {
    const validated = validateToolCall(call);
    if (!tool || !validated.ok) {
      result = validated.ok ? fail(t('tool.unknown', { name: call.name })) : validated;
    } else {
      const { args, notes } = clampArgs(validated.result, tool.ranges);
      const room = (args as { room?: unknown }).room;
      roomId = typeof room === 'string' && state.rooms[room] ? room : null;
      let blocked: string | null = null;
      if (tool.kind === 'env') {
        const target = roomId ? state.rooms[roomId] : undefined;
        if (!target) blocked = t('error.roomNotFound', { room: String(room) });
        else {
          const check = checkPriority(target.override, priority, nowMin, eventId);
          if (!check.allowed) blocked = check.reason;
        }
      }
      if (blocked) {
        result = fail(blocked);
      } else {
        const ctx: ToolContext = { store, priority, source, reason, eventId, nowMin };
        const out = tool.execute(args, ctx);
        result =
          out.ok && notes.length > 0
            ? { ok: true, result: { ...(out.result as Record<string, unknown>), clamped: notes } }
            : out;
      }
    }
  } catch (error) {
    result = fail(error instanceof Error ? error.message : String(error));
  }

  const record = {
    id: newId('call'),
    atMin: nowMin,
    call: { ...call, priority, source, eventId },
    result,
  };
  const shouldLogInRoom =
    roomId !== null && (tool?.kind !== 'info' || call.name === 'notify_staff');
  store.setState((s) => {
    let next = pushCall(s, record);
    if (shouldLogInRoom && roomId) {
      next = patchRoom(next, roomId, (r) =>
        withLog(r, {
          atMin: nowMin,
          action: describeCall(call),
          reason,
          priority,
          source,
          ok: result.ok,
          detail: result.ok ? undefined : result.error,
        }),
      );
    }
    return next;
  });
  return result;
}
