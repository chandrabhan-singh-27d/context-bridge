import { AppError } from '../lib/errors.ts';
import { err, ok, type Result, tryCatch } from '../lib/result.ts';
import type { ChatMessage, ChatRequest, ChatResponse, LlmProvider } from './provider.ts';

const DEFAULT_MODEL = 'gemini-2.0-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiAdapterDeps {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
}

interface GeminiContent {
  readonly role?: string;
  readonly parts: ReadonlyArray<{ readonly text?: string }>;
}

interface GeminiCandidate {
  readonly content?: GeminiContent;
  readonly finishReason?: string;
}

interface GeminiUsage {
  readonly promptTokenCount?: number;
  readonly candidatesTokenCount?: number;
}

interface GeminiResponse {
  readonly candidates?: ReadonlyArray<GeminiCandidate>;
  readonly usageMetadata?: GeminiUsage;
  readonly modelVersion?: string;
}

function buildContents(
  messages: ReadonlyArray<ChatMessage>,
): { system: string | undefined; contents: ReadonlyArray<GeminiContent> } {
  let system: string | undefined;
  const contents: Array<GeminiContent> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = system !== undefined ? `${system}\n${msg.content}` : msg.content;
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  return { system, contents };
}

function mapHttpStatus(status: number, message: string, model: string): AppError {
  switch (status) {
    case 401:
    case 403:
      return AppError.auth('invalid_token', message || 'unauthorized');
    case 429:
      return AppError.rateLimit(0, 0, message || 'rate limited');
    default:
      return AppError.githubApi(
        status,
        message || 'gemini api error',
        `${API_BASE}/models/${model}:generateContent`,
      );
  }
}

function toChatResponse(parsed: GeminiResponse, fallbackModel: string): Result<ChatResponse, AppError> {
  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    const reason = parsed.candidates?.[0]?.finishReason ?? 'unknown';
    return err(AppError.internal(`gemini response empty: finish_reason=${reason}`));
  }
  const usage = parsed.usageMetadata;
  const base: ChatResponse = { content: text, model: parsed.modelVersion ?? fallbackModel };
  return ok(
    usage === undefined
      ? base
      : {
          ...base,
          usage: {
            promptTokens: usage.promptTokenCount ?? 0,
            completionTokens: usage.candidatesTokenCount ?? 0,
          },
        },
  );
}

export function createGeminiProvider(deps: GeminiAdapterDeps): LlmProvider {
  const model = deps.model ?? DEFAULT_MODEL;
  const doFetch = deps.fetchImpl ?? fetch;
  const endpoint = `${API_BASE}/models/${model}:generateContent`;

  return {
    name: 'gemini',
    model,
    async chat(req: ChatRequest): Promise<Result<ChatResponse, AppError>> {
      const { system, contents } = buildContents(req.messages);

      const body: Record<string, unknown> = { contents };
      if (system !== undefined) {
        body['systemInstruction'] = { parts: [{ text: system }] };
      }
      if (req.maxTokens !== undefined) body['generationConfig'] = { maxOutputTokens: req.maxTokens };
      if (req.temperature !== undefined) {
        body['generationConfig'] = { ...(body['generationConfig'] as object), temperature: req.temperature };
      }

      const url = `${endpoint}?key=${encodeURIComponent(deps.apiKey)}`;
      const requestInit: RequestInit = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...(req.signal && { signal: req.signal }),
      };

      const fetched = await tryCatch(
        () => doFetch(url, requestInit),
        (cause) =>
          AppError.internal(
            `gemini request failed: ${(cause as Error)?.message ?? 'unknown'}`,
            cause,
          ),
      );
      if (!fetched.ok) return fetched;

      const response = fetched.value;
      if (!response.ok) {
        return err(mapHttpStatus(response.status, await response.text().catch(() => ''), model));
      }

      const parsed = await tryCatch(
        () => response.json() as Promise<GeminiResponse>,
        (cause) => AppError.internal('gemini response not json', cause),
      );
      return parsed.ok ? toChatResponse(parsed.value, model) : parsed;
    },
  };
}
