import { t } from '../../i18n';
import type { AromaType, ProtocolId, Soundscape, Trigger, TriggerType } from '../types';
import { normalize } from './text';

/**
 * Intérprete de comandos por reglas (sin red): texto → llamadas a funciones.
 * La caja de texto y el micrófono comparten exactamente este intérprete.
 */

export interface InterpretContext {
  selectedRoom: string | null;
  triggers: Trigger[];
  occupiedRooms: string[];
}

export interface PlannedCall {
  name: string;
  args: Record<string, unknown>;
}

export interface Interpretation {
  normalized: string;
  calls: PlannedCall[];
  clarification: string | null;
}

type SegmentResult = { calls: PlannedCall[] } | { clarify: string };

/** Terminaciones de una orden: «incorpora», «incorpore», «incorpórame», «incorporarlo»… */
const IMPERATIVE = '(?:a|e|en|ame|alo|ala)';
const ORDER = '(?:a|e|en|ar|ame|alo|ala|arme|arlo|arla|arse)';

const RE = {
  room: /\b(20[1-9]|210)\b/,
  roomWord: /\b(habitacion|habitaciones|hab|cuarto)\b/,
  open: /\b(abre|abrir|abreme|muestra|muestrame|ensena|ensename|ve a|ir a|entra en|entrar en)\b/,
  state:
    /\b(que estado|estado de|estado tiene|estado esta|como esta|como se encuentra|informe de|resumen de)\b/,
  schedule: /\b(programa|programar|programame|agenda|agendar|anade|crea|crear)\b/,
  cancel: /\b(cancela|cancelar|borra|borrar|elimina|eliminar|anula|anular)\b/,
  notify: /\b(avisa|avisar|avisad|llama|llamar|aviso|alerta|alertar)\b/,
  staff: /\b(enfermer\w*|personal|auxiliar\w*|medic[oa]s?|celador\w*|control)\b/,
  auto: /\b(?:modo|piloto) (?:ia|i a|automatico|inteligente|agente|auto)\b/,
  protocol:
    /\b(?:protocolo|modo|ambiente|escena)\s+(?:de\s+(?:la\s+)?|del\s+)?(noche|calma|manana|comida|medicacion|cura|visita|neutro)\b/,
  aroma: /\b(aroma|aromas|difusor|olor|fragancia|lavanda|citricos?|eucalipto|aromaterapia)\b/,
  sound:
    /\b(sonido|sonidos|musica|volumen|paisaje|altavoz|ruido blanco|lluvia|bosque|olas|mar|pajaros|respiracion|silencio)\b/,
  light: /\b(luz|luces|iluminacion|lampara|lamparas)\b/,
  temp: /\b(temperatura|grados|calefaccion|climatizacion|aire acondicionado|termostato)\b|\btengo (frio|calor)\b/,
  off: /\b(desactiva|desactivar|apaga|apagar|quita|quitar|desconecta|desconectar|para|parar|deten)\b/,
  up: /\b(sube|subir|subela|aumenta|aumentar|incrementa|mas alt[oa]|mas fuerte)\b/,
  down: /\b(baja|bajar|bajala|reduce|reducir|disminuye|disminuir|mas baj[oa]|mas flojo|menos)\b/,
  on: /\b(activa|activar|enciende|encender|pon|poner|conecta|conectar)\b/,
  urgent: /\b(urgente|urgencia|ya|rapido|deprisa|emergencia)\b/,
  little: /\b(un poco|un poquito|algo|ligeramente|un pelin)\b/,
  blinds: /\b(persianas?|estor(?:es)?|cortinas?)\b/,
  blindsUp: /\b(sube|subir|subela|abre|abrir|abrela|levanta|levantar|alza|arriba)\b/,
  blindsDown: /\b(baja|bajar|bajala|cierra|cerrar|cierrala|echa|abajo)\b/,
  half: /\b(mitad|a medias|medio)\b/,
  bed: /\b(cama|camilla|cabecero|respaldo)\b/,
  // Órdenes de postura que no nombran la cama: «incorpórame», «quiero tumbarme»… Solo formas
  // verbales inequívocas: «se siente mal» o «está acostumbrado» no deben mover la cama.
  posture: new RegExp(
    `\\b(incorpor${ORDER}|tumb${ORDER}|acostar(?:me|lo|la|se)?|acuest${IMPERATIVE}|` +
      `recostar(?:me|lo|la|se)?|recuest${IMPERATIVE}|sentar(?:me|lo|la)|sienta(?:me|lo|la))\\b`,
  ),
  bedUp:
    /\b(incorpor\w+|sienta\w*|sentar\w*|sentad[oa]|levanta\w*|sube|subir|subela|eleva\w*|alza\w*|arriba)\b/,
  bedDown:
    /\b(estira\w*|tumb\w+|acost\w+|acuest\w+|baja|bajar|bajala|reclina\w*|horizontal|plan[oa]|abajo)\b/,
  bedSemi: /\b(semi\w*|recost\w+|recuest\w+|a medias|intermedi[oa])\b/,
  otherDevice:
    /\b(temperatura|calefaccion|climatizacion|aire acondicionado|termostato|luz|luces|iluminacion|lamparas?|sonido|musica|volumen|altavoz|aroma|difusor)\b/,
};

const TRIGGER_WORDS: [RegExp, TriggerType][] = [
  [/\bdesayuno\b/, 'desayuno'],
  [/\b(comida|almuerzo)\b/, 'comida'],
  [/\bmerienda\b/, 'merienda'],
  [/\bcena\b/, 'cena'],
  [/\b(medicacion|medicamentos?|pastillas?|farmacos?)\b/, 'medicacion'],
  [/\bcura\b/, 'cura'],
  [/\bvisitas?\b/, 'visita'],
  [/\b(descanso|dormir)\b/, 'descanso'],
  [/\b(despertar|despertador)\b/, 'despertar'],
  [/\b(constantes|signos vitales)\b/, 'constantes'],
];

const SOUNDSCAPE_WORDS: [RegExp, Soundscape][] = [
  [/\bruido blanco\b/, 'ruido_blanco'],
  [/\blluvia\b/, 'lluvia'],
  [/\bbosque\b/, 'bosque'],
  [/\b(olas|mar)\b/, 'olas'],
  [/\bpajaros\b/, 'pajaros'],
  [/\brespiracion\b/, 'respiracion'],
  [/\bsilencio\b/, 'silencio'],
];

const AROMA_WORDS: [RegExp, AromaType][] = [
  [/\blavanda\b/, 'lavanda'],
  [/\bcitricos?\b/, 'citrico'],
  [/\beucalipto\b/, 'eucalipto'],
];

const COMPOUND_SPLIT =
  /\s+[ye]\s+(?=(?:pon|sube|baja|activa|desactiva|apaga|enciende|abre|cierra|avisa|programa|quita|incorpora|incorporame|estira|tumba|tumbame|levanta)\b)/;

function pick<T>(text: string, table: [RegExp, T][]): T | null {
  for (const [re, value] of table) if (re.test(text)) return value;
  return null;
}

function findRoom(text: string): string | null {
  return RE.room.exec(text)?.[1] ?? null;
}

/** Posición de la primera coincidencia (Infinity si no aparece). */
function firstIndex(re: RegExp, text: string): number {
  return re.exec(text)?.index ?? Infinity;
}

function firstNumber(text: string): number | null {
  const match = /(-?\d+(?:\.\d+)?)/.exec(text);
  return match ? Number(match[1]) : null;
}

/** Extrae una hora ("14:00", "a las 2 de la tarde", "a las 9 y media") y la quita del texto. */
export function extractTime(text: string): { time: string; rest: string } | null {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const digital = /\b(\d{1,2})[:h](\d{2})\b/.exec(text);
  if (digital) {
    const h = Number(digital[1]);
    const m = Number(digital[2]);
    if (h < 24 && m < 60)
      return { time: `${pad(h)}:${pad(m)}`, rest: text.replace(digital[0], ' ') };
  }
  const spoken =
    /\ba (?:las|la) (\d{1,2}|una)(?: y (media|cuarto|\d{1,2}))?(?: (?:de la|por la) (manana|tarde|noche))?\b/.exec(
      text,
    );
  if (spoken) {
    let h = spoken[1] === 'una' ? 1 : Number(spoken[1]);
    const extra = spoken[2];
    const m = extra === 'media' ? 30 : extra === 'cuarto' ? 15 : extra ? Number(extra) : 0;
    const part = spoken[3];
    if ((part === 'tarde' || part === 'noche') && h < 12) h += 12;
    if (h === 24) h = 0;
    if (h < 24 && m < 60)
      return { time: `${pad(h)}:${pad(m)}`, rest: text.replace(spoken[0], ' ') };
  }
  return null;
}

function needRoom(room: string | null, build: (room: string) => PlannedCall[]): SegmentResult {
  return room ? { calls: build(room) } : { clarify: t('voice.whichRoom') };
}

function interpretLight(s: string, room: string | null): SegmentResult {
  return needRoom(room, (r) => {
    const args: Record<string, unknown> = { room: r };
    const kelvinMatch = /(\d{4})\s*(?:k|kelvin|grados kelvin)?\b/.exec(s);
    const n = firstNumber(s);
    if (kelvinMatch && Number(kelvinMatch[1]) >= 1000) args.kelvin = Number(kelvinMatch[1]);
    else if (n !== null) args.pct = n;
    if (/\bmas calid[ao]\b/.test(s)) args.deltaKelvin = -500;
    else if (/\bmas fri[ao]\b/.test(s)) args.deltaKelvin = 500;
    else if (/\bcalid[ao]\b/.test(s)) args.kelvin = 2700;
    else if (/\bfri[ao]\b/.test(s)) args.kelvin = 5000;
    if (args.pct === undefined && args.kelvin === undefined && args.deltaKelvin === undefined) {
      if (RE.off.test(s)) args.pct = 0;
      else if (RE.down.test(s)) args.deltaPct = -20;
      else if (RE.up.test(s)) args.deltaPct = 20;
      else if (RE.on.test(s)) args.pct = 70;
    }
    return Object.keys(args).length > 1 ? [{ name: 'set_light', args }] : [];
  });
}

function interpretSound(s: string, room: string | null): SegmentResult {
  return needRoom(room, (r) => {
    const args: Record<string, unknown> = { room: r };
    const scape = pick(s, SOUNDSCAPE_WORDS);
    const n = firstNumber(s);
    if (scape) args.soundscape = scape;
    if (scape === 'silencio') args.pct = 0;
    else if (n !== null) args.pct = n;
    else if (RE.off.test(s)) args.pct = 0;
    else if (RE.down.test(s)) args.deltaPct = -15;
    else if (RE.up.test(s)) args.deltaPct = 15;
    else if (!scape && RE.on.test(s)) args.pct = 30;
    return Object.keys(args).length > 1 ? [{ name: 'set_sound', args }] : [];
  });
}

function interpretTemperature(s: string, room: string | null): SegmentResult {
  return needRoom(room, (r) => {
    const n = firstNumber(s);
    if (n !== null) return [{ name: 'set_temperature', args: { room: r, value: n } }];
    if (/\btengo frio\b/.test(s) || RE.up.test(s)) {
      return [{ name: 'set_temperature', args: { room: r, delta: 1 } }];
    }
    if (/\btengo calor\b/.test(s) || RE.down.test(s)) {
      return [{ name: 'set_temperature', args: { room: r, delta: -1 } }];
    }
    return [];
  });
}

/** Persiana: un número es la apertura; sin número, «sube/abre» = del todo y «baja/cierra» = bajada. */
function interpretBlinds(s: string, room: string | null): SegmentResult {
  return needRoom(room, (r) => {
    const args: Record<string, unknown> = { room: r };
    const n = firstNumber(s);
    const up = RE.blindsUp.test(s);
    const down = RE.blindsDown.test(s);
    if (n !== null) args.pct = n;
    else if (RE.half.test(s)) args.pct = 50;
    else if (RE.little.test(s) && (up || down)) args.deltaPct = up ? 25 : -25;
    else if (up) args.pct = 100;
    else if (down) args.pct = 0;
    return Object.keys(args).length > 1 ? [{ name: 'set_blinds', args }] : [];
  });
}

/**
 * Cama: un número son los grados del respaldo; sin número, «incorpora» = incorporada y
 * «estira/tumba» = plana. Si la lesión del paciente lo impide lo decide `set_bed`, no el intérprete.
 */
function interpretBed(s: string, room: string | null): SegmentResult {
  return needRoom(room, (r) => {
    const args: Record<string, unknown> = { room: r };
    const n = firstNumber(s);
    const up = RE.bedUp.test(s);
    const down = RE.bedDown.test(s);
    if (n !== null) args.deg = n;
    else if (RE.little.test(s) && (up || down)) args.deltaDeg = up ? 15 : -15;
    else if (RE.bedSemi.test(s)) args.position = 'semi';
    else if (up) args.position = 'incorporada';
    else if (down) args.position = 'plana';
    return Object.keys(args).length > 1 ? [{ name: 'set_bed', args }] : [];
  });
}

function interpretSegment(
  raw: string,
  defaultRoom: string | null,
  ctx: InterpretContext,
): SegmentResult {
  const ownRoom = findRoom(raw);
  const room = ownRoom ?? defaultRoom;
  // Para leer valores numéricos se quita el número de habitación del texto.
  const s = ownRoom ? raw.replace(RE.room, ' ') : raw;

  // «abre la persiana de la 205» no es abrir la habitación.
  if (RE.open.test(raw) && (ownRoom || RE.roomWord.test(raw)) && !RE.blinds.test(raw)) {
    return needRoom(ownRoom, (r) => [{ name: 'open_room', args: { room: r } }]);
  }
  if (RE.state.test(raw)) {
    return needRoom(room, (r) => [{ name: 'get_room_state', args: { room: r } }]);
  }
  const triggerType = pick(raw, TRIGGER_WORDS);
  if (RE.schedule.test(raw) && triggerType) {
    const time = extractTime(raw);
    if (!time) return { clarify: t('voice.whichTime') };
    const targetRoom = findRoom(time.rest);
    return {
      calls: [
        {
          name: 'schedule_trigger',
          args: { type: triggerType, time: time.time, room: targetRoom ?? 'all' },
        },
      ],
    };
  }
  if (RE.cancel.test(raw) && triggerType) {
    const time = extractTime(raw);
    const targetRoom = findRoom(time?.rest ?? raw);
    const match = ctx.triggers.find(
      (tr) =>
        tr.type === triggerType &&
        (!time || tr.time === time.time) &&
        (!targetRoom || tr.roomId === targetRoom),
    );
    if (!match) return { clarify: t('voice.triggerNotFound') };
    return { calls: [{ name: 'cancel_trigger', args: { id: match.id } }] };
  }
  if (RE.notify.test(raw) && RE.staff.test(raw)) {
    const args: Record<string, unknown> = {
      message: t('voice.notifyMessage', { room: room ?? '—' }),
      urgency: RE.urgent.test(raw) ? 'alta' : 'media',
    };
    if (room) args.room = room;
    return { calls: [{ name: 'notify_staff', args }] };
  }
  if (RE.auto.test(raw)) {
    const on = !RE.off.test(raw);
    const rooms = room ? [room] : ctx.occupiedRooms;
    return { calls: rooms.map((r) => ({ name: 'set_auto_mode', args: { room: r, on } })) };
  }
  const protocol = RE.protocol.exec(raw)?.[1] as ProtocolId | undefined;
  if (protocol) {
    return needRoom(room, (r) => [{ name: 'apply_protocol', args: { room: r, protocol } }]);
  }
  // Persiana y cama. «Sube» y «baja» valen para varios dispositivos, así que manda el que se
  // nombra primero («sube la temperatura, estoy en la cama» no mueve la cama). Si la frase las
  // nombra pero no pide moverlas («tengo frío en la cama»), se sigue con el resto de reglas.
  const otherDevice = firstIndex(RE.otherDevice, raw);
  if (firstIndex(RE.blinds, raw) < otherDevice) {
    const blinds = interpretBlinds(s, room);
    if ('clarify' in blinds || blinds.calls.length > 0) return blinds;
  }
  if (RE.posture.test(raw) || firstIndex(RE.bed, raw) < otherDevice) {
    const bed = interpretBed(s, room);
    if ('clarify' in bed || bed.calls.length > 0) return bed;
  }
  if (RE.aroma.test(raw)) {
    return needRoom(room, (r) => {
      if (RE.off.test(raw)) return [{ name: 'set_aroma', args: { room: r, on: false } }];
      const args: Record<string, unknown> = { room: r, on: true };
      const type = pick(raw, AROMA_WORDS);
      const n = firstNumber(s);
      if (type) args.type = type;
      if (n !== null) args.pct = n;
      return [{ name: 'set_aroma', args }];
    });
  }
  if (RE.light.test(raw)) return interpretLight(s, room);
  if (RE.sound.test(raw)) return interpretSound(s, room);
  if (RE.temp.test(raw)) return interpretTemperature(s, room);
  return { clarify: t('voice.notUnderstood') };
}

export function interpret(text: string, ctx: InterpretContext): Interpretation {
  const normalized = normalize(text);
  if (!normalized) return { normalized, calls: [], clarification: t('voice.notUnderstood') };
  const defaultRoom = findRoom(normalized) ?? ctx.selectedRoom;
  const calls: PlannedCall[] = [];
  let clarification: string | null = null;
  for (const segment of normalized.split(COMPOUND_SPLIT)) {
    const result = interpretSegment(segment, defaultRoom, ctx);
    if ('clarify' in result) {
      clarification = result.clarify;
      break;
    }
    if (result.calls.length === 0) {
      clarification = t('voice.notUnderstood');
      break;
    }
    calls.push(...result.calls);
  }
  return { normalized, calls: clarification ? [] : calls, clarification };
}
