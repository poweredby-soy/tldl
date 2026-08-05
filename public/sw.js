const SHELL_CACHE = 'tldl-shell-v1';
const SHARE_CACHE = 'tldl-share';
const SHARE_KEY = '/__shared-audio';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('tldl-shell-') && name !== SHELL_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(receiveShare(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(navigateWithCacheFallback(event.request));
  }
});

/**
 * The share sheet POSTs the file here. A static host can't accept a POST, so the
 * worker takes it, parks the file in a cache, and bounces the browser into the app
 * with a GET. The app collects the file on boot.
 */
async function receiveShare(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('audio');

    if (file && typeof file === 'object' && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        SHARE_KEY,
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Shared-Filename': encodeURIComponent(file.name || 'voice-message'),
          },
        }),
      );
      return Response.redirect('/?shared=1', 303);
    }
  } catch {
    // Falls through to the error redirect below.
  }

  return Response.redirect('/?shared=0', 303);
}

async function navigateWithCacheFallback(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    const root = await caches.match('/');
    if (root) {
      return root;
    }
    throw new Error('offline and nothing cached');
  }
}
