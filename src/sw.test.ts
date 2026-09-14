import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import test from 'node:test';

/**
 * `public/sw.js` is served raw, so it cannot be imported. The share intercept is the one
 * genuinely tricky part of the app and the part the Android share sheet keeps breaking,
 * so it is evaluated here in a stubbed worker scope and its helpers called directly.
 */
function loadWorker(): Record<string, (formData: FormData) => unknown> {
  const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const scope = createContext({
    self: { addEventListener() {}, skipWaiting() {}, clients: { claim() {} } },
    caches: {},
    Response: { redirect: () => ({}) },
    Blob,
    File,
    URL,
  });
  runInContext(source, scope);
  return scope as never;
}

const worker = loadWorker();
const pickSharedFile = worker.pickSharedFile as (formData: FormData) => File | null;
const describeShare = worker.describeShare as (formData: FormData) => string;

test('takes the file off the field the manifest asks for', () => {
  const form = new FormData();
  form.set('text', 'sent from WhatsApp');
  form.set('audio', new File(['bytes'], 'AUD-20260914-WA0001.opus', { type: 'audio/ogg' }));

  assert.equal(pickSharedFile(form)?.name, 'AUD-20260914-WA0001.opus');
});

test('takes the file off any other field when the sheet renames it', () => {
  // The share sheet does not always honour the field name in the manifest.
  const form = new FormData();
  form.set('title', 'Voice message');
  form.set('file', new File(['bytes'], 'voice.opus', { type: 'application/octet-stream' }));

  assert.equal(pickSharedFile(form)?.name, 'voice.opus');
});

test('ignores empty files and plain text', () => {
  const form = new FormData();
  form.set('text', 'https://example.com/a-link');
  form.set('audio', new File([], 'voice.opus', { type: 'audio/ogg' }));

  assert.equal(pickSharedFile(form), null);
});

test('describes what a share without audio did contain', () => {
  const form = new FormData();
  form.set('title', 'Voice message');
  form.set('url', 'https://example.com/x');

  const described = describeShare(form);

  assert.match(described, /title/);
  assert.match(described, /url/);
});

test('describes a file by its type and size rather than its contents', () => {
  const form = new FormData();
  form.set('audio', new File(['what-was-said'], 'voice.opus', { type: 'audio/ogg' }));

  const described = describeShare(form);

  assert.match(described, /voice\.opus/);
  assert.match(described, /audio\/ogg/);
  assert.doesNotMatch(described, /what-was-said/);
});
