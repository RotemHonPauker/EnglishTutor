// Fraza's service worker — now two things in one file:
// 1. The original minimal installability shim (no caching, always loads
//    fresh from the network) — unchanged below.
// 2. OneSignal's own service worker code, pulled in via importScripts.
//    It registers its own 'push'/'notificationclick'/'notificationclose'
//    listeners internally, which don't collide with the 'install'/
//    'activate'/'fetch' listeners below — a browser only allows one
//    active service worker per scope, so OneSignal's worker has to live
//    inside this same file rather than as a separate sw file.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Pass every request straight through to the network.
    event.respondWith(fetch(event.request));
});