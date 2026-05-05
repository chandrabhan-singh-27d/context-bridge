import type { AppError } from '../lib/errors.ts';
import type { Result } from '../lib/result.ts';

/**
 * Vendor-agnostic embedding port. Adding a new provider = one adapter file
 * implementing this interface + one entry in the factory switch. Call sites
 * depend on the interface, never on a vendor SDK. Same pattern as LlmProvider.
 *
 * No consumer ships in this PR — the port lands ready for future RAG over
 * issues/PRs/diffs. Establishing the seam now keeps the eventual consumer
 * one-line-swap between providers.
 */

export interface EmbedRequest {
  readonly texts: ReadonlyArray<string>;
  readonly signal?: AbortSignal;
}

export interface EmbedResponse {
  readonly embeddings: ReadonlyArray<ReadonlyArray<number>>;
  readonly model: string;
  readonly dimensions: number;
  readonly usage?: {
    readonly totalTokens: number;
  };
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  embed(req: EmbedRequest): Promise<Result<EmbedResponse, AppError>>;
}
