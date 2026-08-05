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
  saveSettings({
    apiKey: 'key',
    transcribeModel: 'a/model',
    rewriteModel: 'another/model',
    outputLanguage: 'de',
  });

  assert.equal(loadSettings().outputLanguage, 'de');
});

test('falls back to English for a language it does not know', () => {
  // An older or hand-edited entry can hold anything at all.
  stored.set('tldl.settings', JSON.stringify({ apiKey: 'key', outputLanguage: 'fr' }));

  assert.equal(loadSettings().outputLanguage, 'en');
});
