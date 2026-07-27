// Minimal service worker — just enough to make the app installable.
// It doesn't cache anything yet, so the app always loads fresh from the network.

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