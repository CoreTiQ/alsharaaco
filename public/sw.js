const CACHE_VERSION = 'v3'
const RUNTIME = 'runtime-' + CACHE_VERSION

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== RUNTIME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'RELOAD' }))
  })
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/'))
    )
    return
  }

  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.endsWith('.css') ||
    url.href.includes('supabase')
  ) {
    return
  }

  event.respondWith(
    caches.open(RUNTIME).then(async (cache) => {
      const res = await cache.match(req)
      if (res) return res
      const net = await fetch(req)
      try { cache.put(req, net.clone()) } catch (e) {}
      return net
    })
  )
})
