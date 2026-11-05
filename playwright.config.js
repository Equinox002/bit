import { defineConfig } from '@playwright/test';

// Runs against its own database, so end-to-end games never touch development data.
const env = {
    ...process.env,
    APP_ENV: 'local',
    APP_DEBUG: 'false',
    APP_URL: 'http://127.0.0.1:8123',
    DB_DATABASE: 'card_e2e',
    REALTIME_URL: 'http://127.0.0.1:6123',
    REALTIME_PORT: '6123',
    REALTIME_APP_URL: 'http://127.0.0.1:8123',
    REALTIME_SECRET: 'e2e-secret',
    VITE_HOT_FILE: 'storage/framework/e2e-no-hot-file',
};

export default defineConfig({
    testDir: './tests/e2e',
    outputDir: './storage/e2e-results',
    workers: 1,
    timeout: 240000,
    expect: { timeout: 20000 },
    reporter: [['list']],
    globalSetup: './tests/e2e/global-setup.js',
    use: {
        baseURL: 'http://127.0.0.1:8123',
        // Without video: the table's turn glow never stops, so twelve browsers recording it produced
        // hundreds of megabytes and froze the test runner. Page snapshots still record every step.
        trace: { mode: 'retain-on-failure', screenshots: false },
        screenshot: 'only-on-failure',
    },
    webServer: [
        {
            command: 'node scripts/serve.cjs 127.0.0.1 8123',
            url: 'http://127.0.0.1:8123/how-to-play',
            env,
            timeout: 60000,
            reuseExistingServer: false,
        },
        // A second PHP process over the same database: PHP's built-in server handles one request
        // at a time, so truly simultaneous requests need two of them.
        {
            command: 'node scripts/serve.cjs 127.0.0.1 8124',
            url: 'http://127.0.0.1:8124/how-to-play',
            env,
            timeout: 60000,
            reuseExistingServer: false,
        },
        {
            command: 'node realtime/server.js',
            url: 'http://127.0.0.1:6123/health',
            env,
            timeout: 30000,
            reuseExistingServer: false,
        },
    ],
});

export { env };
