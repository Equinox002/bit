import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { env } from '../../playwright.config';
import { assertNoHorizontalOverflow } from './helpers';

const SHOTS = 'storage/e2e-results/screens';
const ADMIN = { email: 'admin@example.com', password: 'e2e-admin-password' };

// Thirty days of realistic data on MySQL, the database the panel runs on in real use.
const SEED = `
    $admin = App\\Models\\User::forceCreate(['name' => 'Asha Admin', 'email' => '${ADMIN.email}', 'password' => Hash::make('${ADMIN.password}'), 'is_admin' => true]);
    $player = App\\Models\\User::forceCreate(['name' => 'Ravi', 'email' => 'ravi@example.com', 'password' => Hash::make('secret-secret')]);
    $guest = App\\Models\\User::forceCreate(['name' => 'Meera', 'email' => 'guest-1@guest.invalid', 'password' => Hash::make('secret-secret'), 'is_guest' => true]);
    App\\Models\\PlayerStatistic::create(['user_id' => $player->id, 'games_played' => 14, 'games_won' => 5, 'bets_placed' => 96, 'bets_won' => 41, 'chips_won' => 5200, 'chips_lost' => 3100, 'biggest_win' => 800]);

    $devices = [['desktop', 'Chrome', 'Windows'], ['mobile', 'Chrome', 'Android'], ['mobile', 'Safari', 'iOS'], ['tablet', 'Safari', 'iOS'], ['desktop', 'Firefox', 'Linux'], ['bot', 'Other', 'Other']];
    $pages = [['/', 'home'], ['/rooms/ABC123', 'rooms.show'], ['/how-to-play', 'how-to-play'], ['/join/ABC123', 'join.show'], ['/pass-and-play', 'pass-and-play'], ['/rooms/create', 'rooms.create']];
    $rows = [];

    for ($back = 29; $back >= 0; $back--) {
        $at = now('Asia/Kolkata')->subDays($back);
        $total = 4 + (29 - $back) % 7 * 3 + ($back % 5 === 0 ? 14 : 0);

        for ($i = 0; $i < $total; $i++) {
            [$device, $browser, $os] = $devices[$i % 11 === 10 ? 5 : $i % 5];
            [$path, $route] = $pages[$i % 7 % 6];
            $ip = '192.168.18.' . (10 + $i % 9);
            $rows[] = [
                'user_id' => [$player->id, null, $guest->id, null][$i % 4], 'ip' => $ip, 'visitor_hash' => hash('sha256', $ip . $browser),
                'path' => $path, 'route_name' => $route, 'referrer' => $i % 6 === 0 ? 'www.google.com/' : null,
                'user_agent' => 'Mozilla/5.0 (' . $os . ') ' . $browser . '/131.0', 'browser' => $browser, 'os' => $os, 'device' => $device,
                'language' => 'en-IN', 'status' => $i % 23 === 22 ? 404 : 200, 'duration_ms' => 20 + $i,
                'visited_on' => $at->toDateString(), 'created_at' => $at->copy()->setTimezone('UTC')->subMinutes($i)->toDateTimeString(),
            ];
        }
    }

    collect($rows)->chunk(200)->each(fn ($chunk) => DB::table('visits')->insert($chunk->all()));

    foreach ([['LIVE01', 'Friday Night Table', 'playing'], ['LOBBY2', 'Office Lunch', 'lobby'], ['DONE03', 'Sunday Family Game', 'finished']] as [$code, $name, $status]) {
        $room = App\\Models\\GameRoom::create(['code' => $code, 'name' => $name, 'created_by' => $player->id, 'status' => $status, 'is_private' => $status !== 'lobby']);
        App\\Models\\RoomMember::create(['game_room_id' => $room->id, 'user_id' => $player->id, 'display_name' => 'Ravi', 'seat' => 0, 'is_host' => true]);
        App\\Models\\RoomMember::create(['game_room_id' => $room->id, 'user_id' => $guest->id, 'display_name' => 'Meera', 'seat' => 1]);

        for ($back = 0; $back < 12; $back += 2) {
            App\\Models\\GameSession::create(['game_room_id' => $room->id, 'status' => 'finished', 'state' => [], 'started_at' => now()->subDays($back * 2), 'ended_at' => now()->subDays($back * 2)]);
        }
    }
`;

test.describe('admin panel', () => {
    test.beforeAll(() => {
        execFileSync('php', ['artisan', 'tinker', `--execute=${SEED.replace(/\s*\n\s*/g, ' ')}`], { env, stdio: 'pipe' });
    });

    async function logIn(page) {
        await page.goto('/admin');
        await expect(page).toHaveURL(/\/login$/);
        await page.getByLabel('Email').fill(ADMIN.email);
        await page.getByLabel('Password').fill(ADMIN.password);
        await page.getByRole('button', { name: 'Log in' }).click();
        await expect(page).toHaveURL(/\/admin$/);
    }

    for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
        test(`every screen works on ${name}`, async ({ page }) => {
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
            await page.setViewportSize(viewport);

            await logIn(page);

            await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
            await expect(page.getByText('Page views today')).toBeVisible();
            await expect(page.getByRole('heading', { name: 'Top IP addresses' })).toBeVisible();
            await expect(page.getByText('Friday Night Table')).toBeVisible();
            await assertNoHorizontalOverflow(page);
            await page.screenshot({ path: `${SHOTS}/admin-overview-${name}.png`, fullPage: true });

            await page.getByRole('link', { name: '7 days' }).click();
            await expect(page).toHaveURL(/days=7/);

            await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Visits' }).click();
            await expect(page.getByRole('heading', { name: 'Visits', exact: true })).toBeVisible();
            await page.getByRole('button', { name: /Details for the visit/ }).first().click();
            await expect(page.getByText('Browser details (user agent)')).toBeVisible();
            await assertNoHorizontalOverflow(page);
            await page.screenshot({ path: `${SHOTS}/admin-visits-${name}.png`, fullPage: true });

            await page.getByLabel('Search visits').fill('192.168.18.11');
            await page.getByLabel('Search visits').press('Enter');
            await expect(page).toHaveURL(/q=192\.168\.18\.11/);
            await page.getByLabel('Device').selectOption('bot');
            await expect(page).toHaveURL(/device=bot/);

            await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Players' }).click();
            await expect(page.getByText('ravi@example.com')).toBeVisible();
            await expect(page.getByText('guest-1@guest.invalid')).toHaveCount(0);
            await assertNoHorizontalOverflow(page);
            await page.screenshot({ path: `${SHOTS}/admin-players-${name}.png`, fullPage: true });

            await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Rooms' }).click();
            await expect(page.getByRole('cell', { name: 'Sunday Family Game' })).toBeVisible();
            await assertNoHorizontalOverflow(page);
            await page.screenshot({ path: `${SHOTS}/admin-rooms-${name}.png`, fullPage: true });

            expect(errors).toEqual([]);
        });
    }

    test('a chart can be read with the keyboard and as a table', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await logIn(page);

        await page.getByRole('group', { name: /Page views, by day/ }).focus();
        await page.keyboard.press('ArrowLeft');
        await expect(page.getByRole('group', { name: /Page views, by day/ }).getByText(/\d+ page views/)).toBeVisible();

        await page.getByText('View as table').first().click();
        await expect(page.getByRole('columnheader', { name: 'Day' }).first()).toBeVisible();
    });

    test('other accounts get a plain 404', async ({ page }) => {
        await page.goto('/login');
        await page.getByLabel('Email').fill('ravi@example.com');
        await page.getByLabel('Password').fill('secret-secret');
        await page.getByRole('button', { name: 'Log in' }).click();
        await expect(page.getByRole('link', { name: 'Ravi' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);

        const response = await page.goto('/admin');

        expect(response.status()).toBe(404);
    });
});
