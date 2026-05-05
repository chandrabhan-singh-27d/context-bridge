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

export function createGroqProvider(deps: GroqAdapterDeps): LlmProvider {
  const model = deps.model ?? DEFAULT_MODEL;
  const doFetch = deps.fetchImpl ?? fetch;

  return {
    name: 'groq',
    model,
    async chat(req: ChatRequest): Promise<Result<ChatResponse, AppError>> {
      const body = {
        model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
      };

      const fetchOpts: RequestInit = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${deps.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      };
      if (req.signal !== undefined) fetchOpts.signal = req.signal;

      const r = await tryCatch(
        () => doFetch(ENDPOINT, fetchOpts),
        (e) => AppError.internal(`groq request failed: ${(e as Error)?.message ?? 'unknown'}`, e),
      );
      if (!r.ok) return r;
      const res = r.value;

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 401) return err(AppError.auth('invalid_token', text || 'unauthorized'));
        if (res.status === 429) return err(AppError.rateLimit(0, 0, text || 'rate limited'));
        return err(AppError.githubApi(res.status, text || 'groq api error', ENDPOINT));
      }

      const parsed = await tryCatch(
        () => res.json() as Promise<GroqApiResponse>,
        (e) => AppError.internal('groq response not json', e),
      );
      if (!parsed.ok) return parsed;

      const content = parsed.value.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        return err(AppError.internal('groq response missing choices[0].message.content'));
      }

      const usage = parsed.value.usage;
      const out: ChatResponse =
        usage === undefined
          ? { content, model: parsed.value.model ?? model }
          : {
              content,
              model: parsed.value.model ?? model,
              usage: {
                promptTokens: usage.prompt_tokens ?? 0,
                completionTokens: usage.completion_tokens ?? 0,
              },
            };
      return ok(out);
    },
  };
}
