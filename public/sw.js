// Lets offline pass-and-play open with no connection. It stores only that page and the built
// assets. Every other request goes straight to the network: online games must never see old data.
const CACHE = 'betwixt-offline-v1';
const OFFLINE_PAGE = '/pass-and-play';
const MANIFEST = '/build/manifest.json';

async function assetUrls() {
    const response = await fetch(MANIFEST, { cache: 'no-store' });
    const manifest = await response.json();
    const urls = new Set();

    Object.values(manifest).forEach((entry) => {
        urls.add(`/build/${entry.file}`);
        (entry.css ?? []).forEach((css) => urls.add(`/build/${css}`));
    });

    return urls;
}

/**
 * Stores the current page and assets, then drops assets left over from earlier builds. A failure
 * leaves the existing copy in place, so a bad connection can't break what already works.
 */
async function refresh() {
    const cache = await caches.open(CACHE);
    const urls = await assetUrls();

    // Built files have unique names, so only ones not already stored need downloading.
    for (const url of urls) {
        if (!(await cache.match(url))) {
            await cache.add(url);
        }
    }

    await cache.add(new Request(OFFLINE_PAGE, { cache: 'no-store', credentials: 'omit' }));

    const stale = (await cache.keys()).filter((request) => {
        const { pathname } = new URL(request.url);

        return pathname !== OFFLINE_PAGE && !urls.has(pathname);
    });

    await Promise.all(stale.map((request) => cache.delete(request)));
}

self.addEventListener('install', (event) => {
    event.waitUntil(refresh().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();

        await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

// Pages ask for this on load, so a new build is picked up without a new service worker.
self.addEventListener('message', (event) => {
    if (event.data === 'refresh') {
        event.waitUntil(refresh().catch(() => {}));
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    if (url.pathname.startsWith('/build/') && url.pathname !== MANIFEST) {
        event.respondWith(caches.match(url.pathname).then((cached) => cached ?? fetch(request)));

        return;
    }

    // Offline, opening the site at any address leads to the one game that works without it.
    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_PAGE)) ?? Response.error()));
    }
});
