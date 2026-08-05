/** Formats the OpenRouter transcription endpoint accepts for `input_audio.format`. */
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

/**
 * `input_audio.data` wants bare base64, no data URI prefix. Encoding runs in chunks
 * because spreading a whole multi-megabyte file into String.fromCharCode blows the
 * argument limit.
 */
export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  return btoa(binary);
}
