// Fraza's service worker: a minimal installability shim (no caching, always
// loads fresh from the network) plus OneSignal's own worker code, which
// must live in this same file since a scope only allows one active worker.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});