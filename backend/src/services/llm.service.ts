import { getAiConfig } from '../config/credentials.js';

/**
 * Thin OpenAI-compatible chat client (Stage 4/5/7).
 *
 * Mirrors the Sales Analytics `ai-extraction.service.ts` pattern: credentials
 * resolved at runtime from the shared credential store (never from the client),
 * JSON-only responses, bounded timeout, and tolerant JSON extraction so a model
 * that wraps output in ```json fences still parses.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** Override the model (e.g. a reasoning model for evaluation). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Ask the provider for a JSON object response when supported. */
  jsonMode?: boolean;
}

function normalizeChatUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

/** Pull the first JSON object out of a model response, fences and prose included. */
export function extractJsonObject<T = unknown>(content: string): T {
  const cleaned = content.replace(/```json?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Tidak ada objek JSON pada respons AI: ${content.slice(0, 200)}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

export interface ChatResult {
  content: string;
  model: string;
  provider: string;
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const ai = await getAiConfig();
  if (!ai.baseUrl || !ai.apiKey) {
    throw new Error('AI belum dikonfigurasi (ai_base_url / ai_api_key kosong).');
  }

  const url = normalizeChatUrl(ai.baseUrl);
  const model = options.model ?? ai.model;

  const body: Record<string, unknown> = {
    model,
    stream: false,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 1200,
  };
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ai.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new Error(`AI HTTP ${res.status}: ${raw.slice(0, 300)}`);
  }

  const rawText = await res.text();

  // Some gateways answer with an SSE-style stream even when stream=false.
  let content = '';
  if (rawText.trim().startsWith('data:')) {
    for (const line of rawText.split('\n')) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      try {
        const json = JSON.parse(line.replace(/^data:\s*/, '')) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
        };
        content += json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
      } catch {
        /* ignore malformed chunk */
      }
    }
  } else {
    const parsed = JSON.parse(rawText) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    content = parsed.choices?.[0]?.message?.content ?? '';
  }

  if (!content.trim()) {
    throw new Error('AI mengembalikan respons kosong.');
  }
  return { content, model, provider: ai.provider || 'custom' };
}

/** Convenience: run a chat and parse the reply as a JSON object. */
export async function chatJson<T>(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<{ data: T; model: string; provider: string }> {
  const result = await chat(messages, options);
  return {
    data: extractJsonObject<T>(result.content),
    model: result.model,
    provider: result.provider,
  };
}
