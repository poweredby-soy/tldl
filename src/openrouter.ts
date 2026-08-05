import { toUpload } from './audio.ts';
import { rewriteSystemPrompt, rewriteUserPrompt } from './prompt.ts';
import type { Language } from './settings.ts';

const BASE_URL = 'https://openrouter.ai/api/v1';

/** Where the rewrite goes when every endpoint of the chosen model is down. */
const SECOND_CHOICE_REWRITE_MODEL = 'google/gemini-3.6-flash';

/** Assigns `status` by hand: `node --test` strips types, it does not compile parameter properties. */
export class OpenRouterError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
  }
}

/** No `Content-Type`: a multipart body has to set its own, boundary and all. */
function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': location.origin,
    'X-Title': 'tldl',
  };
}

async function failure(response: Response): Promise<OpenRouterError> {
  const body = await response.text();
  let detail = body;

  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) {
      detail = parsed.error.message;
    }
  } catch {
    // Keep the raw body.
  }

  return new OpenRouterError(detail || response.statusText, response.status);
}

export type Transcription = {
  text: string;
  cost: number;
  /** Both absent unless the endpoint that served the request reported them. */
  spokenLanguage?: string;
  duration?: number;
};

/**
 * `:nitro` is the shorthand for `provider.sort: 'throughput'`, which a multipart body
 * cannot carry as a nested field. Transcription is most of both the bill and the wait,
 * and the default routing weights price, so the slow endpoint wins by default. It also
 * decides `verbose_json`: whisper-large-v3 answers it on Groq and ignores it on Together.
 *
 * A slug that already names a variant, `:free` or `:floor` or anything else, keeps it.
 */
function fastest(model: string): string {
  return model.includes(':') ? model : `${model}:nitro`;
}

/** Endpoints disagree on the shape: some answer `nl`, some `dutch`. */
function spokenLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const name = value.trim();

  return /^[a-z-]{2,20}$/i.test(name) ? name : undefined;
}

export async function transcribe(
  audio: Blob,
  filename: string,
  apiKey: string,
  model: string,
): Promise<Transcription> {
  const form = new FormData();
  form.append('model', fastest(model));
  form.append('file', toUpload(audio, filename));
  // Buys the spoken language, which the rewrite prompt would otherwise have to infer,
  // and the duration, which is the number this app is named after.
  form.append('response_format', 'verbose_json');

  const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: form,
  });

  if (!response.ok) {
    throw await failure(response);
  }

  const result = (await response.json()) as {
    text?: string;
    language?: unknown;
    duration?: number;
    usage?: { cost?: number };
  };

  return {
    text: result.text?.trim() ?? '',
    cost: result.usage?.cost ?? 0,
    spokenLanguage: spokenLanguage(result.language),
    duration: result.duration,
  };
}

export type Rewrite = {
  text: string;
  cost: number;
};

/**
 * Pulls the finished `data:` payloads out of an SSE buffer and hands back the
 * tail, because a network chunk can end halfway through a line. Everything else
 * on the wire is a comment: OpenRouter sends those to hold the connection open.
 */
export function takeEvents(buffer: string): { events: string[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());

  return { events, rest };
}

async function* events(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    throw new OpenRouterError('The response arrived without a body.', response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }

      const chunk = takeEvents(buffer + decoder.decode(value, { stream: true }));
      buffer = chunk.rest;

      for (const event of chunk.events) {
        if (event === '[DONE]') {
          return;
        }
        yield event;
      }
    }
  } finally {
    await reader.cancel();
  }
}

type Chunk = {
  choices?: { delta?: { content?: string } }[];
  usage?: { cost?: number };
  error?: { message?: string; code?: number };
};

export async function rewrite(
  transcription: Transcription,
  apiKey: string,
  model: string,
  language: Language,
  onDelta: (delta: string) => void,
): Promise<Rewrite> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { ...headers(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      // Every endpoint of one model can be down at once, and this runs with the phone
      // already in hand. Second choice beats an error screen.
      models: [...new Set([model, SECOND_CHOICE_REWRITE_MODEL])],
      route: 'fallback',
      stream: true,
      usage: { include: true },
      // The rewrite translates and compresses, and both need some thinking: with
      // reasoning off the model leaves the message in the spoken language and at
      // close to its spoken length. Low buys the prompt back without the stall.
      reasoning: { effort: 'low' },
      // The rewrite models tend to have a long tail of endpoints at mixed speeds,
      // and the default routing weights price.
      provider: { sort: 'throughput' },
      messages: [
        {
          role: 'system',
          content: rewriteSystemPrompt(language, transcription.spokenLanguage),
        },
        { role: 'user', content: rewriteUserPrompt(transcription.text) },
      ],
    }),
  });

  if (!response.ok) {
    throw await failure(response);
  }

  let text = '';
  let cost = 0;

  for await (const event of events(response)) {
    const chunk = JSON.parse(event) as Chunk;

    if (chunk.error) {
      throw new OpenRouterError(
        chunk.error.message ?? 'The rewrite stopped partway.',
        chunk.error.code ?? response.status,
      );
    }

    // Models like to open on a blank line. Only the first delta needs stripping.
    const content = chunk.choices?.[0]?.delta?.content;
    const delta = text ? content : content?.trimStart();

    if (delta) {
      text += delta;
      onDelta(delta);
    }

    // Usage rides along on a final chunk that carries no content.
    if (chunk.usage) {
      cost = chunk.usage.cost ?? 0;
    }
  }

  return { text: text.trim(), cost };
}
