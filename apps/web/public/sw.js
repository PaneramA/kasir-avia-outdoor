const CACHE_NAME = 'aviaoutdoor-shell-v4'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)
  const isNavigation = request.mode === 'navigate'

  // Bypass API requests completely so runtime data is never intercepted by SW.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    return
  }

  if (isNavigation) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    )
    return
  }

  if (url.origin === self.location.origin) {
    const isStaticAsset = url.pathname.startsWith('/assets/')
      || request.destination === 'script'
      || request.destination === 'style'

    if (isStaticAsset) {
      // Prefer network for hashed bundles to avoid stale JS/CSS causing blank screens.
      event.respondWith(
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && request.url.startsWith('http')) {
              const responseClone = networkResponse.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone))
            }
            return networkResponse
          })
          .catch(() => caches.match(request)),
      )
      return
    }

    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }

        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && request.url.startsWith('http')) {
            const responseClone = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone))
          }
          return networkResponse
        })
      }),
    )
  }
})
