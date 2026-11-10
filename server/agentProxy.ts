import {
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';
import {
  FormatError,
  fromGeminiResponse,
  lastModelUsed,
  toFunctionDeclarations,
  toGeminiContents,
  type ClientMessage,
  type ClientTool,
} from './geminiFormat';

/**
 * Backend del agente de IA: un proxy mínimo hacia la API de Gemini (Google).
 * La API key solo vive aquí (variable de entorno del servidor); el navegador nunca la ve.
 *
 * El navegador envía `{ system, messages, tools }` y ejecuta él mismo las funciones
 * (el estado de la planta vive en memoria en el cliente). Este proxy traduce al formato
 * de Gemini y fija el modelo y los parámetros, de modo que el cliente no puede elegirlos.
 *
 * Si un modelo está saturado o no disponible, la petición pasa al siguiente de la cadena
 * (`model` y luego `fallbackModels`), y ese modelo se aparta un rato.
 *
 * Está escrito sobre datos planos (`ProxyRequest` → `ProxyResponse`) para poder montarlo
 * igual en el servidor de Vite (`server/vitePlugin.ts`) que en una función serverless.
 */

export const AGENT_API_PATH = '/api/agent';
export const DEFAULT_MODEL = 'gemini-3.8-flash';
/** Modelos de respaldo, en orden, si el principal está saturado. */
export const DEFAULT_FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
export const MAX_BODY_BYTES = 200_000;
const MAX_MESSAGES = 40;
const MAX_TOOLS = 32;
const MAX_REQUESTS_PER_MINUTE = 40;
/** Tiempo que se aparta un modelo saturado antes de volver a probarlo. */
export const MODEL_COOLDOWN_MS = 60_000;
/** Tiempo máximo de espera por cada intento. */
const ATTEMPT_TIMEOUT_MS = 30_000;
/**
 * Errores por los que merece la pena probar otro modelo: saturación (503), cuota del
 * modelo agotada (429), fallos del servidor y modelo no disponible para esta clave (404).
 */
const RETRY_ON_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);

export interface ProxyRequest {
  method: string;
  /** Cabecera `Origin` (los navegadores la envían siempre en un POST). */
  origin?: string;
  /** Cabecera `Host` del propio servidor. */
  host?: string;
  contentType?: string;
  body: string;
}

export interface ProxyResponse {
  status: number;
  body: unknown;
}

type GenerateFn = (
  params: GenerateContentParameters,
) => Promise<Pick<GenerateContentResponse, 'candidates' | 'promptFeedback' | 'modelVersion'>>;

export interface AgentProxyOptions {
  /** Si se omite, el SDK la lee del entorno (GEMINI_API_KEY o GOOGLE_API_KEY). */
  apiKey?: string;
  model?: string;
  /** Modelos a los que pasar si el principal falla por saturación (por defecto, los de arriba). */
  fallbackModels?: string[];
  /** Orígenes extra permitidos además del propio host (p. ej. el dominio del frontend). */
  allowedOrigins?: string[];
  /** Punto de inyección para pruebas: sustituye la llamada real a la API. */
  generateContent?: GenerateFn;
  now?: () => number;
  /** Aviso en el servidor cuando se cambia de modelo (sin datos de la petición). */
  log?: (message: string) => void;
}

const fail = (status: number, error: string, message?: string): ProxyResponse => ({
  status,
  body: message ? { error, message } : { error },
});

function sameOrigin(origin: string, host: string | undefined, extra: string[]): boolean {
  if (extra.includes(origin)) return true;
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** `thinkingLevel` solo existe en Gemini 3 y posteriores (2.5 usa `thinkingBudget`). */
function supportsThinkingLevel(model: string): boolean {
  return /^gemini-([3-9]|\d{2,})/.test(model);
}

/** El SDK pone el JSON de error de Google en `message`: se extrae el texto legible. */
function upstreamMessage(error: ApiError): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === 'string') return parsed.error.message;
  } catch {
    /* no era JSON */
  }
  return error.message;
}

export function createAgentProxy(options: AgentProxyOptions = {}) {
  const model = options.model || DEFAULT_MODEL;
  const chain = [...new Set([model, ...(options.fallbackModels ?? DEFAULT_FALLBACK_MODELS)])];
  const now = options.now ?? Date.now;
  const log = options.log ?? ((message: string) => console.warn(`[agente] ${message}`));
  const configured = Boolean(
    options.generateContent ||
    options.apiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY,
  );
  let client: GoogleGenAI | null = null;
  const recent: number[] = [];
  /** Modelo → instante hasta el que se considera saturado. */
  const coolingUntil = new Map<string, number>();

  const generateContent: GenerateFn =
    options.generateContent ??
    ((params) => {
      client ??= new GoogleGenAI({
        ...(options.apiKey ? { apiKey: options.apiKey } : {}),
        // Sin reintentos en el SDK: ante saturación es más rápido pasar al siguiente modelo.
        httpOptions: { timeout: ATTEMPT_TIMEOUT_MS },
      });
      return client.models.generateContent(params);
    });

  function rateLimited(): boolean {
    const t = now();
    while (recent.length > 0 && t - (recent[0] ?? 0) > 60_000) recent.shift();
    if (recent.length >= MAX_REQUESTS_PER_MINUTE) return true;
    recent.push(t);
    return false;
  }

  /**
   * Orden de modelos para esta petición: primero el que ya está llevando el turno (para no
   * cambiar a mitad de una orden), después el resto de la cadena; los saturados, al final.
   */
  function modelOrder(messages: ClientMessage[]): string[] {
    const current = lastModelUsed(messages);
    const ordered = current && chain.includes(current) ? [current, ...chain] : chain;
    const unique = [...new Set(ordered)];
    const t = now();
    const ready = unique.filter((m) => (coolingUntil.get(m) ?? 0) <= t);
    return [...ready, ...unique.filter((m) => !ready.includes(m))];
  }

  function paramsFor(
    target: string,
    body: { system: string; messages: ClientMessage[]; tools: ClientTool[] },
  ): GenerateContentParameters {
    return {
      model: target,
      contents: toGeminiContents(body.messages, target),
      config: {
        systemInstruction: body.system,
        tools: [{ functionDeclarations: toFunctionDeclarations(body.tools) }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        // Incluye los tokens de razonamiento: con poco margen la respuesta se cortaría.
        maxOutputTokens: 8192,
        // Órdenes cortas y frecuentes: prima la latencia. Súbelo si hace falta más criterio.
        ...(supportsThinkingLevel(target)
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
      },
    };
  }

  return async function handle(req: ProxyRequest): Promise<ProxyResponse> {
    // Estado, sin secretos: la interfaz lo usa para saber si puede ofrecer el agente de IA.
    if (req.method === 'GET') {
      return { status: 200, body: { configured, model, fallbackModels: chain.slice(1) } };
    }
    if (req.method !== 'POST') return fail(405, 'method_not_allowed');

    // Solo el propio frontend puede usar el proxy: otra web no puede gastar la API key.
    if (req.origin && !sameOrigin(req.origin, req.host, options.allowedOrigins ?? [])) {
      return fail(403, 'forbidden_origin');
    }
    if (!req.contentType?.toLowerCase().startsWith('application/json')) {
      return fail(415, 'unsupported_media_type');
    }
    if (req.body.length > MAX_BODY_BYTES) return fail(413, 'payload_too_large');

    let raw: { system?: unknown; messages?: unknown; tools?: unknown };
    try {
      raw = JSON.parse(req.body) as typeof raw;
    } catch {
      return fail(400, 'bad_json');
    }
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof raw.system !== 'string' ||
      !Array.isArray(raw.messages) ||
      !Array.isArray(raw.tools) ||
      raw.messages.length === 0 ||
      raw.messages.length > MAX_MESSAGES ||
      raw.tools.length > MAX_TOOLS
    ) {
      return fail(400, 'bad_request');
    }
    const body = {
      system: raw.system,
      messages: raw.messages as ClientMessage[],
      tools: raw.tools as ClientTool[],
    };
    try {
      // Valida el formato una vez antes de gastar ninguna llamada.
      toGeminiContents(body.messages);
    } catch (error) {
      if (error instanceof FormatError) return fail(400, 'bad_request', error.message);
      throw error;
    }

    if (!configured) return fail(503, 'not_configured', 'Falta GEMINI_API_KEY en el servidor');
    if (rateLimited()) return fail(429, 'rate_limited');

    const tried: string[] = [];
    let last: ApiError | null = null;
    for (const target of modelOrder(body.messages)) {
      tried.push(target);
      try {
        const out = fromGeminiResponse(await generateContent(paramsFor(target, body)), target);
        if (tried.length > 1)
          log(`respondió ${target} (no disponibles: ${tried.slice(0, -1).join(', ')})`);
        return out.ok ? { status: 200, body: out.response } : fail(502, out.error, out.message);
      } catch (error) {
        // No se registra el cuerpo de la petición: puede contener el estado de las habitaciones.
        if (!(error instanceof ApiError)) {
          return fail(
            500,
            'internal_error',
            error instanceof Error ? error.message : String(error),
          );
        }
        const badKey =
          error.status === 401 || error.status === 403 || /api key/i.test(error.message);
        if (badKey) return fail(503, 'not_configured', 'La API key de Gemini no es válida');
        if (!RETRY_ON_STATUS.has(error.status)) {
          return fail(
            502,
            'upstream_error',
            `Gemini respondió ${error.status}: ${upstreamMessage(error)}`,
          );
        }
        last = error;
        coolingUntil.set(target, now() + MODEL_COOLDOWN_MS);
        log(`${target} no disponible (${error.status}); se prueba el siguiente modelo`);
      }
    }

    const detail = last ? `${last.status}: ${upstreamMessage(last)}` : '—';
    return fail(
      last?.status === 429 ? 429 : 503,
      'models_unavailable',
      `Ningún modelo de Gemini está disponible ahora mismo (${tried.join(', ')}). Último error ${detail}`,
    );
  };
}
