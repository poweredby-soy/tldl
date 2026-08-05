const SHARE_CACHE = 'tldl-share';
const SHARE_KEY = '/__shared-audio';

export type SharedAudio = {
  blob: Blob;
  filename: string;
};

/**
 * Collects the file the service worker parked during the share POST. Reading it is
 * destructive: the cache entry is dropped so a later reload doesn't reprocess a
 * message that has already been handled.
 */
export async function takeSharedAudio(): Promise<SharedAudio | null> {
  if (!('caches' in self)) {
    return null;
  }

  const cache = await caches.open(SHARE_CACHE);
  const response = await cache.match(SHARE_KEY);

  if (!response) {
    return null;
  }

  const filename = decodeURIComponent(
    response.headers.get('X-Shared-Filename') ?? 'voice-message',
  );
  const blob = await response.blob();
  await cache.delete(SHARE_KEY);

  if (blob.size === 0) {
    return null;
  }

  return { blob, filename };
}
