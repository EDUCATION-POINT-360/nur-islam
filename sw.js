/**
 * NUR ISLAMIC PLATFORM - PRODUCTION SERVICE WORKER (PHASE 4)
 * Offline Architecture Engine & Request Interceptor
 */

const CACHE_NAME = 'nur-v1-static-assets';

// 1. Core Platform Visual & Architectural Assets Asset Mapping
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
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// 2. Install Event: Populate Cache Strategy
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[NUR SW] Pre-caching structural assets...');
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// 3. Activate Event: Clean Legacy Storage Cycles
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[NUR SW] Removing old cache matrix:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 4. Fetch Strategy: Hybrid Performance Interceptor
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Dynamic API calls (Quran Cloud, Hadith APIs, Supabase endpoints) use Network-First
    if (url.origin !== self.location.origin && !url.href.includes('cdnjs') && !url.href.includes('tailwindcss')) {
        e.respondWith(
            fetch(e.request)
                .then((response) => {
                    // Cache a clone of the successful dynamic network query response
                    const resClone = response.clone();
                    caches.open('nur-dynamic-data').then((cache) => {
                        cache.put(e.request, resClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Network down: Fall through immediately to local cached response backup maps
                    return caches.match(e.request);
                })
        );
    } else {
        // App Shell Core Assets use Cache-First, falling back to network
        e.respondWith(
            caches.match(e.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;

                return fetch(e.request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200) return networkResponse;
                    
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseToCache);
                    });
                    return networkResponse;
                });
            })
        );
    }
});
