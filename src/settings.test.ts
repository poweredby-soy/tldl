import { strict as assert } from 'node:assert';
import test from 'node:test';
import { loadSettings, saveSettings } from './settings.ts';

// Settings live in the browser, which the test runner is not.
const stored = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  },
});

test('keeps the language it was saved with', () => {
  saveSettings({ apiKey: 'key', outputLanguage: 'de' });

  assert.equal(loadSettings().outputLanguage, 'de');
});

test('falls back to English for a language it does not know', () => {
  // An older or hand-edited entry can hold anything at all.
  stored.set('tldl.settings', JSON.stringify({ apiKey: 'key', outputLanguage: 'fr' }));

  assert.equal(loadSettings().outputLanguage, 'en');
});

test('ignores the models an older entry pinned', () => {
  // Every device that saved before the models moved out of Settings still holds the slugs
  // it saved, and reading them back would keep it on whichever pair was current that day.
  stored.set(
    'tldl.settings',
    JSON.stringify({
      apiKey: 'key',
      transcribeModel: 'openai/whisper-large-v3',
      rewriteModel: 'deepseek/deepseek-v4-flash',
      outputLanguage: 'en',
    }),
  );

  assert.deepEqual(loadSettings(), { apiKey: 'key', outputLanguage: 'en' });
});
