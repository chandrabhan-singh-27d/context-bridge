import { AppError } from '../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../lib/result.ts';
import type { ChatRequest, ChatResponse, LlmProvider } from './provider.ts';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export interface GroqAdapterDeps {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
}

interface GroqApiResponse {
  readonly choices?: ReadonlyArray<{ readonly message?: { readonly content?: string } }>;
  readonly model?: string;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
  };
}

function mapHttpStatus(status: number, message: string): AppError {
  switch (status) {
    case 401:
      return AppError.auth('invalid_token', message || 'unauthorized');
    case 429:
      return AppError.rateLimit(0, 0, message || 'rate limited');
    default:
      return AppError.githubApi(status, message || 'groq api error', ENDPOINT);
  }
}

function toChatResponse(
  parsed: GroqApiResponse,
  fallbackModel: string,
): Result<ChatResponse, AppError> {
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return err(AppError.internal('groq response missing choices[0].message.content'));
  }
  const u = parsed.usage;
  const base: ChatResponse = { content, model: parsed.model ?? fallbackModel };
  return ok(
    u === undefined
      ? base
      : {
          ...base,
          usage: { promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0 },
        },
  );
}

export function createGroqProvider(deps: GroqAdapterDeps): LlmProvider {
  const model = deps.model ?? DEFAULT_MODEL;
  const doFetch = deps.fetchImpl ?? fetch;

  return {
    name: 'groq',
    model,
    async chat(req: ChatRequest): Promise<Result<ChatResponse, AppError>> {
      const body = JSON.stringify({
        model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
      });
      const headers = {
        authorization: `Bearer ${deps.apiKey}`,
        'content-type': 'application/json',
      };
      const init: RequestInit = {
        method: 'POST',
        headers,
        body,
        ...(req.signal && { signal: req.signal }),
      };

      const sent = await tryCatch(
        () => doFetch(ENDPOINT, init),
        (e) => AppError.internal(`groq request failed: ${(e as Error)?.message ?? 'unknown'}`, e),
      );
      if (!sent.ok) return sent;

      const res = sent.value;
      if (!res.ok) return err(mapHttpStatus(res.status, await res.text().catch(() => '')));

      const parsed = await tryCatch(
        () => res.json() as Promise<GroqApiResponse>,
        (e) => AppError.internal('groq response not json', e),
      );
      return parsed.ok ? toChatResponse(parsed.value, model) : parsed;
    },
  };
}
