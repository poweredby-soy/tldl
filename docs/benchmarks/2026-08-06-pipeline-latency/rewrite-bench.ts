import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteSystemPrompt, rewriteUserPrompt } from '../../../src/prompt.ts';

// Usage: OPENROUTER_API_KEY=... node rewrite-bench.ts <passes> <path/to/voice.ogg>
const KEY = process.env.OPENROUTER_API_KEY!;
const DIR = dirname(fileURLToPath(import.meta.url));
const AUDIO = process.argv[3];

const transcript = readFileSync(
  join(DIR, 'transcripts/openai_whisper-large-v3-turbo.txt'),
  'utf8',
).trim();

// Only the single-call runs need it, so a missing sample still leaves the rest usable.
const audio = AUDIO ? readFileSync(AUDIO).toString('base64') : '';

type Run = {
  label: string;
  model: string;
  reasoning?: Record<string, unknown>;
  sort?: string;
  /** Sends the voice note itself instead of the transcript: one call, no transcription step. */
  fromAudio?: boolean;
};

function messages(run: Run) {
  const system = rewriteSystemPrompt('de', 'German');

  if (!run.fromAudio) {
    return [
      { role: 'system', content: system },
      { role: 'user', content: rewriteUserPrompt(transcript) },
    ];
  }

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Here is the voice message. Rewrite it.' },
        { type: 'input_audio', input_audio: { data: audio, format: 'ogg' } },
      ],
    },
  ];
}

async function bench(run: Run) {
  const body: Record<string, unknown> = {
    model: run.model,
    stream: true,
    usage: { include: true },
    messages: messages(run),
  };
  if (run.reasoning) body.reasoning = run.reasoning;
  if (run.sort) body.provider = { sort: run.sort };

  const started = performance.now();
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tldl.local',
      'X-Title': 'tldl-bench',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.log(`${run.label.padEnd(36)} HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
    return null;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let reasoning = '';
  let firstContent = 0;
  let cost = 0;
  let provider = '';
  let error = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;

      const chunk = JSON.parse(payload);
      if (chunk.error) error = JSON.stringify(chunk.error).slice(0, 200);
      provider ||= chunk.provider ?? '';
      const delta = chunk.choices?.[0]?.delta;

      if (delta?.reasoning) reasoning += delta.reasoning;
      if (delta?.content) {
        firstContent ||= performance.now() - started;
        text += delta.content;
      }
      if (chunk.usage) cost = chunk.usage.cost ?? 0;
    }
  }

  const total = performance.now() - started;
  console.log(
    `${run.label.padEnd(36)} first-word ${(firstContent / 1000).toFixed(2)}s  total ${(total / 1000).toFixed(2)}s  ` +
      `think ${reasoning.length.toString().padStart(5)}ch  out ${text.length.toString().padStart(5)}ch  ` +
      `$${cost.toFixed(5)}  ${provider}${error ? '  ERR ' + error : ''}`,
  );

  return { ...run, text, reasoning, firstContent, total, cost, provider };
}

const runs: Run[] = [
  { label: 'deepseek low + throughput', model: 'deepseek/deepseek-v4-flash', reasoning: { effort: 'low' }, sort: 'throughput' },
  { label: 'deepseek low + latency', model: 'deepseek/deepseek-v4-flash', reasoning: { effort: 'low' }, sort: 'latency' },
  { label: 'deepseek none + throughput', model: 'deepseek/deepseek-v4-flash', reasoning: { enabled: false }, sort: 'throughput' },
  { label: 'gemini-3-flash-preview', model: 'google/gemini-3-flash-preview', reasoning: { effort: 'low' }, sort: 'latency' },
  { label: 'gemini-3.5-flash', model: 'google/gemini-3.5-flash', reasoning: { effort: 'low' }, sort: 'latency' },
  { label: 'gemini-3.5-flash-lite', model: 'google/gemini-3.5-flash-lite', reasoning: { effort: 'low' }, sort: 'latency' },
  { label: 'gemini-3.1-flash-lite', model: 'google/gemini-3.1-flash-lite', reasoning: { effort: 'low' }, sort: 'latency' },
  { label: 'gemini-3.6-flash', model: 'google/gemini-3.6-flash', reasoning: { effort: 'low' }, sort: 'latency' },
  { label: 'AUDIO gemini-3-flash', model: 'google/gemini-3-flash-preview', reasoning: { effort: 'low' }, sort: 'latency', fromAudio: true },
  { label: 'AUDIO gemini-3.1-flash-lite', model: 'google/gemini-3.1-flash-lite', reasoning: { effort: 'low' }, sort: 'latency', fromAudio: true },
  { label: 'AUDIO gemini-3.6-flash', model: 'google/gemini-3.6-flash', reasoning: { effort: 'low' }, sort: 'latency', fromAudio: true },
];

const passes = Number(process.argv[2] ?? 1);
const results = [];
for (let pass = 1; pass <= passes; pass++) {
  console.log(`--- pass ${pass}`);
  for (const run of runs) {
    const result = await bench(run);
    if (result) results.push({ pass, ...result });
  }
}

writeFileSync(join(DIR, 'rewrite-results.json'), JSON.stringify(results, null, 1));
