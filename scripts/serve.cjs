// Runs PHP's built-in server with OPcache on, for this project only, without editing php.ini.
// A request takes about 0.02s this way instead of about 0.3s. That matters here because this
// server handles one request at a time, so every player at a table queues behind the others.
//
// Usage: node scripts/serve.cjs [host] [port]
const { spawn } = require('node:child_process');
const path = require('node:path');

const host = process.argv[2] ?? '127.0.0.1';
const port = process.argv[3] ?? '8000';
const root = path.join(__dirname, '..');

const server = spawn('php', [
    '-d', 'zend_extension=opcache',
    '-d', 'opcache.enable=1',
    '-d', 'opcache.memory_consumption=128',
    '-d', 'opcache.max_accelerated_files=20000',
    '-S', `${host}:${port}`,
    path.join(root, 'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php'),
], { cwd: path.join(root, 'public'), stdio: ['ignore', 'ignore', 'inherit'] });

console.log(`Serving on http://${host}:${port}`);

server.on('exit', (code) => process.exit(code ?? 0));
['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => server.kill()));
