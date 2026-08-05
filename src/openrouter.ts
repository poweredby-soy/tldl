import { detectFormat, toBase64 } from './audio.ts';
import { REWRITE_SYSTEM_PROMPT, rewriteUserPrompt } from './prompt.ts';

const BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OpenRouterError';
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

export async function rewrite(
  transcript: string,
  apiKey: string,
  model: string,
): Promise<Rewrite> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model,
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

  const result = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { cost?: number };
  };

  return {
    text: result.choices?.[0]?.message?.content?.trim() ?? '',
    cost: result.usage?.cost ?? 0,
  };
}
