import { detectFormat, toBase64 } from './audio.ts';
import { REWRITE_SYSTEM_PROMPT, rewriteUserPrompt } from './prompt.ts';

const BASE_URL = 'https://openrouter.ai/api/v1';

/** Assigns `status` by hand: `node --test` strips types, it does not compile parameter properties. */
export class OpenRouterError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
  }
}

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
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
};

export async function transcribe(
  audio: Blob,
  filename: string,
  apiKey: string,
  model: string,
): Promise<Transcription> {
  const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model,
      input_audio: {
        data: await toBase64(audio),
        format: detectFormat(audio.type, filename),
      },
    }),
  });

  if (!response.ok) {
    throw await failure(response);
  }

  const result = (await response.json()) as {
    text?: string;
    usage?: { cost?: number };
  };

  return {
    text: result.text?.trim() ?? '',
    cost: result.usage?.cost ?? 0,
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
  transcript: string,
  apiKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<Rewrite> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model,
      stream: true,
      usage: { include: true },
      messages: [
        { role: 'system', content: REWRITE_SYSTEM_PROMPT },
        { role: 'user', content: rewriteUserPrompt(transcript) },
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
