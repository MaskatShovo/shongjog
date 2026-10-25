import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'demo/vite.config.ts'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
const assets = readdirSync('showcase-dist/assets').map(name => './assets/' + name);
const files = ['./', './index.html', ...assets];
writeFileSync(path.join('showcase-dist', 'sw.js'), `
const CACHE = 'shongjog-public-demo-v2';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('shongjog-public-demo-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('message', event => { if(event.data?.type === 'CACHE_SHELL') event.source?.postMessage({type:'SHELL_CACHED'}); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
  else event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
`);
console.log('Public demo built with an offline application shell. Warehouse and SMS are browser simulations.');
