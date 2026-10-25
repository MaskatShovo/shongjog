const CACHE = 'shongjog-shell-v1';
self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_SHELL' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter(value => { try { const u = new URL(value); return u.origin === self.location.origin && /\.(js|css|svg|woff2?)$/.test(u.pathname); } catch { return false; } });
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await Promise.all(urls.map(async url => { const response = await fetch(url); if (response.ok) await cache.put(url, response); }));
    event.source?.postMessage({ type: 'SHELL_CACHED' });
  }));
});
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => { const response = await fetch('/'); if (response.ok && response.headers.get('content-type')?.includes('text/html')) await cache.put('/', response); }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shongjog-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || url.pathname.startsWith('/api/') || /signin|signout|callback/.test(url.pathname)) return;
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(fetch(event.request).then(async response => { if(response.ok && response.headers.get('content-type')?.includes('text/html')) { const cache=await caches.open(CACHE); await cache.put('/',response.clone()); } return response; }).catch(async () => (await caches.match('/')) || new Response('Open Shongjog online once to prepare this device.', {status:503,headers:{'Content-Type':'text/plain'}})));
  } else if (/\.(js|css|svg|woff2?|png|ico)$/.test(url.pathname)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(async response => { if(response.ok) { const cache=await caches.open(CACHE); await cache.put(event.request,response.clone()); } return response; })));
  }
});
