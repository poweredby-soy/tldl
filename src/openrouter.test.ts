import { strict as assert } from 'node:assert';
import test from 'node:test';
import { rewrite, takeEvents } from './openrouter.ts';

// The request headers carry the origin, which only a browser has.
Object.defineProperty(globalThis, 'location', { value: { origin: 'https://tldl.test' } });

/** Answers the next fetch with an SSE body delivered in the given pieces. */
function respondWith(pieces: string[]): void {
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            for (const piece of pieces) {
              controller.enqueue(new TextEncoder().encode(piece));
            }
            controller.close();
          },
        }),
      ),
    );
}

function contentEvent(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}

test('reads the data payloads and drops everything else', () => {
  // OpenRouter pads the stream with comments to keep the connection alive.
  const { events, rest } = takeEvents(': OPENROUTER PROCESSING\ndata: {"a":1}\n\ndata: [DONE]\n');

  assert.deepEqual(events, ['{"a":1}', '[DONE]']);
  assert.equal(rest, '');
});

test('holds back a line the network chunk cut in half', () => {
  const first = takeEvents('data: {"a":1}\ndata: {"b":');
  assert.deepEqual(first.events, ['{"a":1}']);
  assert.equal(first.rest, 'data: {"b":');

  const second = takeEvents(first.rest + '2}\n');
  assert.deepEqual(second.events, ['{"b":2}']);
  assert.equal(second.rest, '');
});

test('hands over each delta as it lands and keeps the cost off the last chunk', async () => {
  respondWith([
    ': OPENROUTER PROCESSING\n',
    contentEvent('\n\nI found'),
    contentEvent(' her alone.'),
    `data: ${JSON.stringify({ choices: [], usage: { cost: 0.0004 } })}\n`,
    'data: [DONE]\n',
  ]);

  const deltas: string[] = [];
  const result = await rewrite('a transcript', 'key', 'a/model', (delta) => deltas.push(delta));

  // The leading blank line the model opened with never reaches the screen.
  assert.deepEqual(deltas, ['I found', ' her alone.']);
  assert.equal(result.text, 'I found her alone.');
  assert.equal(result.cost, 0.0004);
});

test('raises an error the stream reports after it has already started', async () => {
  respondWith([
    contentEvent('I found'),
    `data: ${JSON.stringify({ error: { message: 'upstream died', code: 502 } })}\n`,
  ]);

  await assert.rejects(() => rewrite('a transcript', 'key', 'a/model', () => {}), {
    message: 'upstream died',
    status: 502,
  });
});
