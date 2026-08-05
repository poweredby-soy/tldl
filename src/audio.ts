/** Containers the OpenRouter transcription endpoint reads. */
const SUPPORTED_FORMATS = ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'webm', 'aac'] as const;

export type AudioFormat = (typeof SUPPORTED_FORMATS)[number];

const BY_EXTENSION: Record<string, AudioFormat> = {
  opus: 'ogg',
  ogg: 'ogg',
  oga: 'ogg',
  mp3: 'mp3',
  mpga: 'mp3',
  m4a: 'm4a',
  mp4: 'm4a',
  aac: 'aac',
  wav: 'wav',
  wave: 'wav',
  flac: 'flac',
  webm: 'webm',
};

/**
 * WhatsApp voice notes are Opus in an Ogg container, shared as `.opus`. The endpoint
 * has no `opus` format, so they go up as `ogg` and the provider decodes the codec.
 *
 * The share sheet is not reliable about MIME types and sometimes hands over
 * `application/octet-stream`, so the filename extension is trusted first.
 */
export function detectFormat(mimeType: string, filename: string): AudioFormat {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if (BY_EXTENSION[extension]) {
    return BY_EXTENSION[extension];
  }

  // Container first: `audio/webm;codecs=opus` is WebM, not Ogg.
  const mime = mimeType.toLowerCase();
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg') || mime.includes('opus')) return 'ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('wav')) return 'wav';

  return 'ogg';
}

const MIME_TYPES: Record<AudioFormat, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  aac: 'audio/aac',
};

/**
 * The endpoint reads the container off the upload itself, so the audio goes up under
 * a name and a type it knows rather than the `.opus` and the `application/octet-stream`
 * the share sheet handed over. Re-wrapping is a view over the same bytes, not a copy.
 */
export function toUpload(audio: Blob, filename: string): File {
  const format = detectFormat(audio.type, filename);

  return new File([audio], `voice.${format}`, { type: MIME_TYPES[format] });
}
