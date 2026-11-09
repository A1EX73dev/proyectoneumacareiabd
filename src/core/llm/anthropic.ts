import { t } from '../../i18n';
import type { LlmProvider, LlmRequest, LlmResponse, LlmToolCall } from './types';

export class LlmNotConfiguredError extends Error {
  constructor() {
    super(t('llm.notConfigured'));
    this.name = 'LlmNotConfiguredError';
  }
}

export interface AnthropicProviderOptions {
  /**
   * URL de TU backend (p. ej. una función serverless `/api/agent`) que guarda la API key
   * y reenvía la petición a Anthropic. Nunca se debe poner la clave en el cliente.
   */
  endpoint?: string;
  model?: string;
}

/**
 * STUB. No hace ninguna llamada de red: siempre rechaza con un error claro.
 * Ver docs/LLM.md para conectarlo a un backend.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';

  constructor(readonly options: AnthropicProviderOptions = {}) {}

  complete(_req: LlmRequest): Promise<LlmResponse> {
    return Promise.reject(new LlmNotConfiguredError());
  }

  /**
   * Convierte el cuerpo de una respuesta de la Messages API (bloques `text` y `tool_use`)
   * en `LlmResponse`. Es pura y está lista para cuando exista el backend.
   */
  static parseMessagesResponse(body: unknown): LlmResponse {
    const content = (body as { content?: unknown }).content;
    if (!Array.isArray(content)) return { toolCalls: [] };
    const toolCalls: LlmToolCall[] = [];
    const texts: string[] = [];
    for (const block of content as Record<string, unknown>[]) {
      if (block.type === 'tool_use' && typeof block.name === 'string') {
        toolCalls.push({
          id: typeof block.id === 'string' ? block.id : `tu-${toolCalls.length}`,
          name: block.name,
          args: (block.input as Record<string, unknown>) ?? {},
        });
      } else if (block.type === 'text' && typeof block.text === 'string') {
        texts.push(block.text);
      }
    }
    return { toolCalls, text: texts.join('\n') || undefined };
  }
}
