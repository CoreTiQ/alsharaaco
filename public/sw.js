const CACHE_VERSION = 'v5'
const RUNTIME = 'runtime-' + CACHE_VERSION

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )

  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'RELOAD' }))
  })
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // السماح فقط بـ http/https — نتجاهل chrome-extension: وملفات النظام
  if (!url.protocol.startsWith('http')) {
    return
  }

  // لا نتعامل مع أي شيء غير GET في الكاش
  if (req.method !== 'GET') {
    return
  }

  // صفحات تنقّل: نحاول الشبكة أولاً ثم الـ cache كنسخة احتياطية للـ "/" فقط
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/'))
    )
    return
  }

  // لا نكاشّي مسارات Next.js الداخلية ولا طلبات Supabase ولا ملفات الـ source maps
  if (
    url.pathname.startsWith('/_next/') ||
    url.href.includes('supabase.co') ||
    url.pathname.endsWith('.map')
  ) {
    return
  }

  // استراتيجية Cache-first بسيطة لباقي الأصول/الصور/الخطوط
  event.respondWith(
    caches.open(RUNTIME).then(async (cache) => {
      const cached = await cache.match(req)
      if (cached) return cached

      try {
        const network = await fetch(req)
        try {
          cache.put(req, network.clone())
        } catch (e) {
          // تجاهل أخطاء put (مثلاً response غير قابلة للتخزين)
        }
        return network
      } catch (e) {
        return new Response('Offline', { status: 503, statusText: 'Offline' })
      }
    })
  )
})
