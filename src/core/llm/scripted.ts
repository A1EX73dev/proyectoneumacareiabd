import type { LlmProvider, LlmRequest, LlmResponse } from './types';

/**
 * Proveedor local con respuestas guionizadas. Sirve para pruebas y para desarrollar
 * el LlmPlanner sin red. Guarda la última petición para poder inspeccionarla.
 */
export class ScriptedProvider implements LlmProvider {
  readonly name = 'scripted';
  lastRequest: LlmRequest | null = null;

  constructor(private readonly responder: (req: LlmRequest) => LlmResponse) {}

  complete(req: LlmRequest): Promise<LlmResponse> {
    this.lastRequest = req;
    try {
      return Promise.resolve(this.responder(req));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
