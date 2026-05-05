import type { AppError } from '../lib/errors.ts';
import type { Result } from '../lib/result.ts';

/**
 * Vendor-agnostic LLM port. Adding a new provider = one adapter implementing
 * this interface + one entry in the factory switch. Call sites depend on the
 * interface, never on a vendor SDK.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
}

export interface ChatRequest {
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly signal?: AbortSignal;
}

export interface ChatResponse {
  readonly content: string;
  readonly model: string;
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  chat(req: ChatRequest): Promise<Result<ChatResponse, AppError>>;
}
