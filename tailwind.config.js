import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.jsx',
    ],

    theme: {
        extend: {
            screens: {
                // A phone held sideways: wide enough for sm: styles, but with very little height.
                short: { raw: '(max-height: 500px)' },
            },
            fontFamily: {
                sans: ['Figtree', ...defaultTheme.fontFamily.sans],
                display: ['"Playfair Display"', ...defaultTheme.fontFamily.serif],
            },
            colors: {
                felt: { 950: '#04201a', 900: '#062b21', 800: '#0a3a2c', 700: '#0e4d3a', 600: '#13634a', 500: '#1a7a5c' },
                ink: { 950: '#0b0e0d', 900: '#131715', 800: '#1b201e', 700: '#282e2b', 600: '#3a413d' },
                gold: { 200: '#f3e2b5', 300: '#ecd08a', 400: '#e2bd62', 500: '#cfa23f', 600: '#a77f2a' },
                ivory: { 50: '#faf7ef', 100: '#f1ecdf', 200: '#ddd8c9', 300: '#c2bdae', 400: '#9c988b' },
                win: { 300: '#86efac', 400: '#4ade80', 600: '#16a34a' },
                loss: { 300: '#fca5a5', 400: '#f87171', 600: '#dc2626' },
            },
            boxShadow: {
                card: '0 6px 16px -4px rgb(0 0 0 / 0.55)',
                gold: '0 0 0 2px #e2bd62, 0 0 22px -2px rgb(226 189 98 / 0.55)',
            },
        },
    },

    plugins: [forms],
};
