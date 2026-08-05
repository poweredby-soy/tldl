import { strict as assert } from 'node:assert';
import test from 'node:test';
import { detectFormat, toUpload } from './audio.ts';

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

test('uploads a WhatsApp voice note under a name and a type the endpoint reads', () => {
  // The endpoint has no `opus`, so Opus-in-Ogg goes up as the Ogg it is.
  const upload = toUpload(
    new Blob(['bytes'], { type: 'application/octet-stream' }),
    'AUD-20260805-WA0001.opus',
  );

  assert.equal(upload.name, 'voice.ogg');
  assert.equal(upload.type, 'audio/ogg');
});

test('keeps the bytes it was handed', async () => {
  const upload = toUpload(new Blob(['the original bytes']), 'voice.m4a');

  assert.equal(upload.type, 'audio/mp4');
  assert.equal(await upload.text(), 'the original bytes');
});
