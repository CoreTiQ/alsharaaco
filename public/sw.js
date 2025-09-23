const CACHE_NAME = 'law-calendar-v1'
const urlsToCache = ['/', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))).then(() => self.clients.claim())
  )
})
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/') || e.request.url.includes('supabase')) return
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)))
})
