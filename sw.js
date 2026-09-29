'use strict';
/* おちつきポーチ・そよぎ Service Worker
   ・install時に実行ファイルをprecache / HTMLはnetwork-first / その他はcache-first
   ・開発/検証用ファイル(_始まり)はキャッシュしない
   🔴 更新のたびに CACHE 名を上げる。screens/ に画面を足したら ASSETS にも足す(_check.js が照合) */
const CACHE = 'pouch-v12';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './audio.js',
  './tap.js',
  './i18n.js',
  './photo.js',
  './app.js',
  './screens/router.js',
  './screens/parts.js',
  './screens/home.js',
  './screens/calm.js',
  './screens/search.js',
  './screens/food.js',
  './screens/gesture.js',
  './manifest.json',
  './privacy.html',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin === location.origin && u.pathname.split('/').pop().startsWith('_')) return;
  const isHTML = e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok && u.origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && u.origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }))
  );
});
