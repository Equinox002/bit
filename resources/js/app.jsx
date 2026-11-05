import './bootstrap';
import '../css/app.css';

import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { GAME_NAME } from '@/game/brand';

createInertiaApp({
    title: (title) => `${title} - ${GAME_NAME}`,
    resolve: (name) => resolvePageComponent(`./Pages/${name}.jsx`, import.meta.glob('./Pages/**/*.jsx')),
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(<App {...props} />);
    },
    progress: {
        color: '#e2bd62',
    },
});

// Prepares offline pass-and-play on any visit. Browsers only allow service workers on HTTPS and
// localhost, and development assets aren't stable enough to store.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/sw.js')
            .then((registration) => registration.active?.postMessage('refresh'))
            .catch(() => {});
    });
}
