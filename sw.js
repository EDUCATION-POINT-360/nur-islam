/**
 * NUR ISLAMIC PLATFORM - PRODUCTION SERVICE WORKER (PHASE 7)
 * Media Storage Assets Optimization & Hybrid Core Network Interceptor
 */

const CACHE_NAME = 'nur-v2-static-and-media';

const ASSETS_TO_CACHE = [
    './index.html',
    './quran.html',
    './hadees.html',
    './namaz.html',
    './tabeeh.html',
    './adkhar.html',
    './nur-core.js',
    './manifest.json',
    './logo.png',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    // Cache standard high-fidelity audio streams for offline access
    'https://www.islamcan.com/audio/adhan/azan1.mp3',
    'https://www.islamcan.com/audio/adhan/azan2.mp3'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[NUR SW] Hydrating media buffers and asset caching trees...');
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[NUR SW] Clearing deprecated asset layers:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interceptor strategy with Range request support for media items
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Streamlined handling for audio media files (.mp3) or tracking domains
    if (url.pathname.endsWith('.mp3') || url.href.includes('audio')) {
        e.respondWith(
            caches.match(e.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(e.request).then((networkResponse) => {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
                    return networkResponse;
                });
            })
        );
        return;
    }

    // Dynamic APIs utilize Network-First execution
    if (url.origin !== self.location.origin && !url.href.includes('cdnjs') && !url.href.includes('tailwindcss')) {
        e.respondWith(
            fetch(e.request)
                .then((response) => {
                    const resClone = response.clone();
                    caches.open('nur-dynamic-data').then((cache) => cache.put(e.request, resClone));
                    return response;
                })
                .catch(() => caches.match(e.request))
        );
    } else {
        // Core layout structural files use Cache-First execution
        e.respondWith(
            caches.match(e.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(e.request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200) return networkResponse;
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
                    return networkResponse;
                });
            })
        );
    }
});
