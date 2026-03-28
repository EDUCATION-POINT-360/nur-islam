// sw.js - NUR Persistent Background Worker
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NAMAZ_NOTIFICATION') {
        const { name, delay } = event.data;
        
        // Background Alarm Timer
        setTimeout(() => {
            self.registration.showNotification(`Azan: ${name}`, {
                body: `It is time for ${name} prayer. (NUR Portal)`,
                icon: 'logo.png', 
                vibrate: [500, 200, 500],
                requireInteraction: true,
                tag: name
            });
        }, delay);
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
