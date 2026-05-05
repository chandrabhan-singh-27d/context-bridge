import { AppError } from '../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../lib/result.ts';
import type { EmbeddingProvider, EmbedRequest, EmbedResponse } from './provider.ts';

const DEFAULT_MODEL = 'voyage-3';
const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';

export interface VoyageEmbeddingDeps {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
}

interface VoyageEmbeddingResponse {
  readonly data?: ReadonlyArray<{
    readonly embedding?: ReadonlyArray<number>;
    readonly index?: number;
  }>;
  readonly model?: string;
  readonly usage?: { readonly total_tokens?: number };
}

function mapHttpStatus(status: number, message: string): AppError {
  switch (status) {
    case 401:
      return AppError.auth('invalid_token', message || 'unauthorized');
    case 429:
      return AppError.rateLimit(0, 0, message || 'rate limited');
    default:
      return AppError.githubApi(status, message || 'voyage embeddings error', ENDPOINT);
  }
}

function toEmbedResponse(
  parsed: VoyageEmbeddingResponse,
  fallbackModel: string,
): Result<EmbedResponse, AppError> {
  const data = parsed.data;
  if (data === undefined || data.length === 0) {
    return err(AppError.internal('voyage embeddings response missing data[]'));
  }
  const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const embeddings = ordered.map((entry) => entry.embedding ?? []);
  if (embeddings.some((vec) => vec.length === 0)) {
    return err(AppError.internal('voyage embeddings response contained empty vector'));
  }
  const dimensions = embeddings[0]?.length ?? 0;
  const usage = parsed.usage;
  const base: EmbedResponse = {
    embeddings,
    model: parsed.model ?? fallbackModel,
    dimensions,
  };
  return ok(
    usage === undefined ? base : { ...base, usage: { totalTokens: usage.total_tokens ?? 0 } },
  );
}

export function createVoyageEmbeddingProvider(deps: VoyageEmbeddingDeps): EmbeddingProvider {
  const model = deps.model ?? DEFAULT_MODEL;
  const doFetch = deps.fetchImpl ?? fetch;

  return {
    name: 'voyage',
    model,
    async embed(req: EmbedRequest): Promise<Result<EmbedResponse, AppError>> {
      if (req.texts.length === 0) {
        return err(AppError.validation('texts', 'must contain at least one input string'));
      }
      const requestBody = JSON.stringify({ model, input: req.texts });
      const requestInit: RequestInit = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${deps.apiKey}`,
          'content-type': 'application/json',
        },
        body: requestBody,
        ...(req.signal && { signal: req.signal }),
      };

      const fetched = await tryCatch(
        () => doFetch(ENDPOINT, requestInit),
        (cause) =>
          AppError.internal(
            `voyage embeddings request failed: ${(cause as Error)?.message ?? 'unknown'}`,
            cause,
          ),
      );
      if (!fetched.ok) return fetched;

      const response = fetched.value;
      if (!response.ok) {
        return err(mapHttpStatus(response.status, await response.text().catch(() => '')));
      }

      const parsed = await tryCatch(
        () => response.json() as Promise<VoyageEmbeddingResponse>,
        (cause) => AppError.internal('voyage embeddings response not json', cause),
      );
      return parsed.ok ? toEmbedResponse(parsed.value, model) : parsed;
    },
  };
}
