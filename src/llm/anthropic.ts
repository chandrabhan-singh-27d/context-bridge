import { AppError } from '../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../lib/result.ts';
import type { ChatMessage, ChatRequest, ChatResponse, LlmProvider } from './provider.ts';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 4_096;
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicAdapterDeps {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
}

interface AnthropicApiResponse {
  readonly content?: ReadonlyArray<{ readonly type?: string; readonly text?: string }>;
  readonly model?: string;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
  };
}

function mapHttpStatus(status: number, message: string): AppError {
  switch (status) {
    case 401:
      return AppError.auth('invalid_token', message || 'unauthorized');
    case 429:
      return AppError.rateLimit(0, 0, message || 'rate limited');
    default:
      return AppError.githubApi(status, message || 'anthropic api error', ENDPOINT);
  }
}

/**
 * Anthropic separates the system prompt from conversation messages. Pull
 * the leading system message(s) into a single string and re-shape the rest
 * into Anthropic's user/assistant message array.
 */
function partitionMessages(messages: ReadonlyArray<ChatMessage>): {
  system: string | undefined;
  conversation: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
} {
  const systemPieces: string[] = [];
  const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const message of messages) {
    if (message.role === 'system') {
      systemPieces.push(message.content);
    } else {
      conversation.push({ role: message.role, content: message.content });
    }
  }
  return {
    system: systemPieces.length > 0 ? systemPieces.join('\n\n') : undefined,
    conversation,
  };
}

function toChatResponse(
  parsed: AnthropicApiResponse,
  fallbackModel: string,
): Result<ChatResponse, AppError> {
  const text = parsed.content?.find((block) => block.type === 'text')?.text;
  if (typeof text !== 'string') {
    return err(AppError.internal('anthropic response missing content[].text'));
  }
  const usage = parsed.usage;
  const base: ChatResponse = { content: text, model: parsed.model ?? fallbackModel };
  return ok(
    usage === undefined
      ? base
      : {
          ...base,
          usage: {
            promptTokens: usage.input_tokens ?? 0,
            completionTokens: usage.output_tokens ?? 0,
          },
        },
  );
}

export function createAnthropicProvider(deps: AnthropicAdapterDeps): LlmProvider {
  const model = deps.model ?? DEFAULT_MODEL;
  const doFetch = deps.fetchImpl ?? fetch;

  return {
    name: 'anthropic',
    model,
    async chat(req: ChatRequest): Promise<Result<ChatResponse, AppError>> {
      const { system, conversation } = partitionMessages(req.messages);
      const requestBody = JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: req.temperature,
        ...(system !== undefined ? { system } : {}),
        messages: conversation,
      });
      const requestInit: RequestInit = {
        method: 'POST',
        headers: {
          'x-api-key': deps.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: requestBody,
        ...(req.signal && { signal: req.signal }),
      };

      const fetched = await tryCatch(
        () => doFetch(ENDPOINT, requestInit),
        (cause) =>
          AppError.internal(
            `anthropic request failed: ${(cause as Error)?.message ?? 'unknown'}`,
            cause,
          ),
      );
      if (!fetched.ok) return fetched;

      const response = fetched.value;
      if (!response.ok) {
        return err(mapHttpStatus(response.status, await response.text().catch(() => '')));
      }

      const parsed = await tryCatch(
        () => response.json() as Promise<AnthropicApiResponse>,
        (cause) => AppError.internal('anthropic response not json', cause),
      );
      return parsed.ok ? toChatResponse(parsed.value, model) : parsed;
    },
  };
}
