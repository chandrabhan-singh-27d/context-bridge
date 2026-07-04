import { AppError } from '../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../lib/result.ts';
import type { ChatRequest, ChatResponse, LlmProvider } from './provider.ts';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export interface OpenAiAdapterDeps {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

interface OpenAiApiResponse {
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
      return AppError.githubApi(status, message || 'openai api error', DEFAULT_ENDPOINT);
  }
}

function toChatResponse(
  parsed: OpenAiApiResponse,
  fallbackModel: string,
): Result<ChatResponse, AppError> {
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return err(AppError.internal('openai response missing choices[0].message.content'));
  }
  const usage = parsed.usage;
  const base: ChatResponse = { content, model: parsed.model ?? fallbackModel };
  return ok(
    usage === undefined
      ? base
      : {
          ...base,
          usage: {
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
          },
        },
  );
}

export function createOpenAiProvider(deps: OpenAiAdapterDeps): LlmProvider {
  const model = deps.model ?? DEFAULT_MODEL;
  const doFetch = deps.fetchImpl ?? fetch;
  const endpoint = deps.baseUrl !== undefined
    ? `${deps.baseUrl.replace(/\/+$/, '')}/chat/completions`
    : DEFAULT_ENDPOINT;

  return {
    name: 'openai',
    model,
    async chat(req: ChatRequest): Promise<Result<ChatResponse, AppError>> {
      const requestBody = JSON.stringify({
        model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
      });
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
        () => doFetch(endpoint, requestInit),
        (cause) =>
          AppError.internal(
            `openai request failed: ${(cause as Error)?.message ?? 'unknown'}`,
            cause,
          ),
      );
      if (!fetched.ok) return fetched;

      const response = fetched.value;
      if (!response.ok) {
        return err(mapHttpStatus(response.status, await response.text().catch(() => '')));
      }

      const parsed = await tryCatch(
        () => response.json() as Promise<OpenAiApiResponse>,
        (cause) => AppError.internal('openai response not json', cause),
      );
      return parsed.ok ? toChatResponse(parsed.value, model) : parsed;
    },
  };
}
