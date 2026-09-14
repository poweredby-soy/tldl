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
    const file = pickSharedFile(formData);

    if (file) {
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

    return shareFailed(describeShare(formData));
  } catch (error) {
    return shareFailed(`unreadable share (${error})`);
  }
}

/** Sends the app back what arrived instead, which is the only account of a share that went wrong. */
function shareFailed(sent) {
  return Response.redirect(`/?shared=0&sent=${encodeURIComponent(sent.slice(0, 200))}`, 303);
}

/**
 * The manifest asks for the file under `audio`, and the share sheet does not always agree:
 * field names and MIME types both come from the sending app and both drift between its
 * releases. Any field carrying bytes is the voice message, because nothing else is sent.
 */
function pickSharedFile(formData) {
  const named = formData.get('audio');

  if (hasBytes(named)) {
    return named;
  }

  for (const value of formData.values()) {
    if (hasBytes(value)) {
      return value;
    }
  }

  return null;
}

function hasBytes(value) {
  return value instanceof Blob && value.size > 0;
}

/** Names the fields and types a share carried, never their contents. */
function describeShare(formData) {
  const parts = [];

  for (const [name, value] of formData.entries()) {
    parts.push(
      value instanceof Blob
        ? `${name}=${value.name || 'file'} (${value.type || 'no type'}, ${value.size} bytes)`
        : `${name}=text`,
    );
  }

  return parts.length > 0 ? parts.join(', ') : 'nothing';
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
