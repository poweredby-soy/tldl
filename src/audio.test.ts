import { strict as assert } from 'node:assert';
import test from 'node:test';
import { detectFormat, looksLikeAudio, toUpload } from './audio.ts';

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

test('lets through anything that might be audio, including a type that says nothing', () => {
  // The share sheet now has to accept every type to receive anything at all, so this is
  // the only thing standing between a shared photo and a transcription bill.
  assert.equal(looksLikeAudio('audio/ogg', 'AUD-20260914-WA0001.opus'), true);
  assert.equal(looksLikeAudio('application/octet-stream', 'voice.opus'), true);
  assert.equal(looksLikeAudio('application/octet-stream', 'Voice message'), true);
  assert.equal(looksLikeAudio('*/*', 'Voice message'), true);
  assert.equal(looksLikeAudio('', ''), true);
});

test('turns away what plainly says it is something else', () => {
  assert.equal(looksLikeAudio('image/jpeg', 'IMG-20260914-WA0002.jpg'), false);
  assert.equal(looksLikeAudio('application/pdf', 'invoice.pdf'), false);
  assert.equal(looksLikeAudio('text/plain', 'note.txt'), false);
  assert.equal(looksLikeAudio('video/mp4', 'clip.mkv'), false);
});

test('believes the extension over a type that says it is something else', () => {
  // A voice note handed over as video/mp4 is still a voice note.
  assert.equal(looksLikeAudio('video/mp4', 'voice.m4a'), true);
});
