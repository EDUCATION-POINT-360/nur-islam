// NUR ISLAMIC PLATFORM - PRODUCTION SERVICE WORKER (FINAL CONSOLIDATED)
const CACHE_NAME = 'nur-v3-islamic-os-cache';

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
    'https://www.islamcan.com/audio/adhan/azan1.mp3',
    'https://www.islamcan.com/audio/adhan/azan2.mp3',
    'https://www.islamcan.com/audio/adhan/makkah.mp3'
];

// Install Event: Cache core assets
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Hybrid Network Interceptor
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Audio/Media Cache-First
    if (url.pathname.endsWith('.mp3') || url.href.includes('audio')) {
        e.respondWith(
            caches.match(e.request).then((cachedResponse) => {
                return cachedResponse || fetch(e.request).then((networkResponse) => {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
                    return networkResponse;
                });
            })
        );
        return;
    }

    // External API Network-First
    if (url.origin !== self.location.origin && !url.href.includes('cdnjs') && !url.href.includes('tailwindcss')) {
        e.respondWith(
            fetch(e.request)
                .then((response) => {
                    const resClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
                    return response;
                })
                .catch(() => caches.match(e.request))
        );
    } else {
        // Core structural files Cache-First
        e.respondWith(
            caches.match(e.request).then((cachedResponse) => {
                return cachedResponse || fetch(e.request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200) return networkResponse;
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
                    return networkResponse;
                });
            })
        );
    }
});

// Push Notification Handler
self.addEventListener('push', (event) => {
    let data = { title: 'NUR Islamic Platform', body: 'روزانہ کی برکات حاصل کریں!' };
    if (event.data) {
        try { data = event.data.json(); } catch(e) { data.body = event.data.text(); }
    }

    event.waitUntil(self.registration.showNotification(data.title, {
        body: data.body,
        icon: './logo.png',
        badge: './logo.png',
        vibrate: [200, 100, 200],
        data: { url: data.url || './index.html' }
    }));
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            for (const client of clientList) {
                if (client.url === event.notification.data.url && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(event.notification.data.url);
        })
    );
});

// Background Sync Handler
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'daily-islamic-feed') {
        event.waitUntil(sendDailyLocalNotification());
    }
});

async function sendDailyLocalNotification() {
    let title = "✨ آیتِ مبارکہ";
    let message = "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا - بے شک مشکل کے ساتھ آسانی ہے۔";
    const showHadith = Math.random() > 0.5;

    try {
        if (showHadith) {
            const res = await fetch('https://api.sunnah.com/v1/hadiths/random');
            const data = await res.json();
            title = "📖 آج کی حدیث";
            message = data.hadith[0].body || message;
        } else {
            const randomAyah = Math.floor(Math.random() * 6236) + 1;
            const res = await fetch(`https://api.alquran.cloud/v1/ayah/${randomAyah}/editions/quran-simple,ur.jandagarhi`);
            const data = await res.json();
            if (data?.data) {
                title = `✨ آیتِ مبارکہ (${data.data[0].surah.englishName}: ${data.data[0].numberInSurah})`;
                message = `${data.data[0].text}\n\nترجمہ: ${data.data[1].text}`;
            }
        }
    } catch (err) {
        console.error("[NUR SW Sync] API fetch failed, using fallback.", err);
    }

    await self.registration.showNotification(title, {
        body: message,
        icon: './logo.png',
        badge: './logo.png',
        data: { url: showHadith ? './hadees.html' : './quran.html' }
    });
}
