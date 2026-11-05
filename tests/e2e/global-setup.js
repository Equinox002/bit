import { execFileSync } from 'node:child_process';

const E2E_DATABASE = 'card_e2e';

/**
 * Creates and resets the end-to-end database. The reset is pinned to this one database name.
 */
export default function globalSetup() {
    const env = { ...process.env, DB_DATABASE: E2E_DATABASE };
    const createDatabase = `
        $pdo = new PDO('mysql:host=' . (getenv('DB_HOST') ?: '127.0.0.1'), getenv('DB_USERNAME') ?: 'root', getenv('DB_PASSWORD') ?: '');
        $pdo->exec('CREATE DATABASE IF NOT EXISTS ${E2E_DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    `;

    execFileSync('php', ['-r', createDatabase], { env, stdio: 'inherit' });

    const connected = execFileSync('php', ['artisan', 'tinker', '--execute=echo DB::getDatabaseName();'], { env }).toString().trim();

    if (connected !== E2E_DATABASE) {
        throw new Error(`Refusing to reset [${connected}]: expected ${E2E_DATABASE}.`);
    }

    execFileSync('php', ['artisan', 'migrate:fresh', '--force'], { env, stdio: 'ignore' });
    execFileSync('php', ['artisan', 'cache:clear'], { env, stdio: 'ignore' });
}
