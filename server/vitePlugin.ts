import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { AGENT_API_PATH, MAX_BODY_BYTES, createAgentProxy } from './agentProxy';

/**
 * Monta el backend del agente (`/api/agent`) dentro del servidor de Vite, tanto en
 * `npm run dev` como en `npm run preview`. La API key se lee de `.env.local`
 * (GEMINI_API_KEY, sin prefijo VITE_, así que nunca entra en el bundle del cliente).
 */
export function agentApi(): Plugin {
  let handle: ReturnType<typeof createAgentProxy> | null = null;

  function readBody(req: IncomingMessage): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= MAX_BODY_BYTES) chunks.push(chunk);
      });
      req.on('end', () =>
        resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString('utf8')),
      );
      req.on('error', reject);
    });
  }

  async function middleware(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    try {
      const body = req.method === 'POST' ? await readBody(req) : '';
      if (body === null) return send(413, { error: 'payload_too_large' });
      const out = await handle!({
        method: req.method ?? 'GET',
        origin: req.headers.origin,
        host: req.headers.host,
        contentType: req.headers['content-type'],
        body,
      });
      send(out.status, out.body);
    } catch {
      send(500, { error: 'internal_error' });
    }
  }

  // Sin valor de retorno: si el hook devuelve una función, Vite la toma por un post-hook.
  const mount = (server: {
    middlewares: { use: (path: string, fn: typeof middleware) => unknown };
  }): void => {
    server.middlewares.use(AGENT_API_PATH, middleware);
  };

  return {
    name: 'neumacare-agent-api',
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      handle = createAgentProxy({
        apiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || undefined,
        model: env.NEUMACARE_MODEL || undefined,
        fallbackModels: env.NEUMACARE_FALLBACK_MODELS
          ? env.NEUMACARE_FALLBACK_MODELS.split(',')
              .map((m) => m.trim())
              .filter(Boolean)
          : undefined,
      });
    },
    configureServer: mount,
    configurePreviewServer: mount,
  };
}
