/**
 * NUR ISLAMIC PLATFORM - PRODUCTION SERVICE WORKER (PHASE 7)
 * Media Storage Assets Optimization & Hybrid Core Network Interceptor
 */

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
    // Cache standard high-fidelity audio streams for offline access
    'https://www.islamcan.com/audio/adhan/azan1.mp3',
    'https://www.islamcan.com/audio/adhan/azan2.mp3',
    'https://www.islamcan.com/audio/adhan/makkah.mp3'
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

    // Dynamic APIs utilize Network-First execution with Cache Fallback
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


// لائیو نوٹیفیکیشنز اور الارم ہینڈلر
self.addEventListener('push', (event) => {
    let data = { title: 'NUR Islamic Platform', body: 'روزانہ کی برکات حاصل کریں!' };
    if (event.data) {
        try { data = event.data.json(); } catch(e) { data.body = event.data.text(); }
    }

    const options = {
        body: data.body,
        icon: './logo.png',
        badge: './logo.png',
        vibrate: [200, 100, 200],
        data: { url: data.url || './index.html' }
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
});

// نوٹیفیکیشن پر کلک کرنے سے ایپ کھولنے کا لاجک
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            for (const client of clientList) {
                if (client.url === event.notification.data.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) { return clients.openWindow(event.notification.data.url); }
        })
    );
});

// آٹو الارم شیڈولر (بیک گراؤنڈ میں رئیل ٹائم ڈیٹا فیچنگ لاجک)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'daily-islamic-feed') {
        event.waitUntil(sendDailyLocalNotification());
    }
});

async function sendDailyLocalNotification() {
    let title = "✨ آیتِ مبارکہ";
    let message = "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا - بے شک مشکل کے ساتھ آسانی ہے۔";
    
    // رینڈم طریقے سے طے کریں کہ اس بار آیت دکھانی ہے یا حدیث
    const showHadith = Math.random() > 0.5;

    try {
        if (showHadith) {
            // رئیل ٹائم اوپن سورس حدیث API سے ڈیٹا فیچ کرنا
            const res = await fetch('https://api.sunnah.com/v1/hadiths/random', {
                headers: { 'X-API-Key': 'YOUR_SUNNAH_API_KEY_IF_NEEDED' } 
            });
            const data = await res.json();
            title = "📖 آج کی حدیث";
            message = data.hadith[0].body || message;
        } else {
            // رئیل ٹائم القرطاس/القرآن API سے رینڈم یا یومیہ آیت فیچ کرنا
            const randomAyah = Math.floor(Math.random() * 6236) + 1;
            const res = await fetch(`https://api.alquran.cloud/v1/ayah/${randomAyah}/editions/quran-simple,ur.jandagarhi`);
            const data = await res.json();
            if (data && data.data) {
                title = `✨ آیتِ مبارکہ (${data.data[0].surah.englishName}: ${data.data[0].numberInSurah})`;
                message = `${data.data[0].text}\n\nترجمہ: ${data.data[1].text}`;
            }
        }
    } catch (err) {
        console.log("[NUR SW Sync] API fetch deferred, using localized fallback core metrics.", err);
    }

    await self.registration.showNotification(title, {
        body: message,
        icon: './logo.png',
        badge: './logo.png',
        data: { url: showHadith ? './hadees.html' : './quran.html' }
    });
}
