import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { detectFormat, toBase64 } from './audio.ts';

test('reads the container before the codec', () => {
  // MediaRecorder in Chrome produces Opus inside WebM, not inside Ogg.
  assert.equal(detectFormat('audio/webm;codecs=opus', 'blob'), 'webm');
  assert.equal(detectFormat('audio/ogg; codecs=opus', 'blob'), 'ogg');
});

test('trusts the filename extension over the reported MIME type', () => {
  // The Android share sheet often reports octet-stream for a WhatsApp voice note.
  assert.equal(detectFormat('application/octet-stream', 'AUD-20260805-WA0001.opus'), 'ogg');
  assert.equal(detectFormat('application/octet-stream', 'voice.m4a'), 'm4a');
});

test('maps the formats the transcription endpoint accepts', () => {
  assert.equal(detectFormat('audio/mpeg', 'voice.mp3'), 'mp3');
  assert.equal(detectFormat('audio/mp4', 'voice.m4a'), 'm4a');
  assert.equal(detectFormat('audio/aac', 'voice.aac'), 'aac');
  assert.equal(detectFormat('audio/flac', 'voice.flac'), 'flac');
  assert.equal(detectFormat('', 'recording.wav'), 'wav');
});

test('falls back to ogg when nothing identifies the audio', () => {
  assert.equal(detectFormat('application/octet-stream', 'no-extension-at-all'), 'ogg');
});

test('encodes bytes identically to a reference base64 encoder', async () => {
  // Exercises the chunked encoder on a payload big enough to blow the argument
  // limit if String.fromCharCode were handed the whole buffer at once.
  const bytes = readFileSync(new URL('./audio.test.ts', import.meta.url));
  const padded = Buffer.concat(Array.from({ length: 64 }, () => bytes));

  assert.equal(await toBase64(new Blob([padded])), padded.toString('base64'));
});
