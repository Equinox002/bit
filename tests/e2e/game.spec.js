import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
    assertNoHorizontalOverflow,
    assertSeatsDoNotOverlap,
    clickAction,
    createRoom,
    joinByCode,
    joinByLink,
    readNumber,
    shouldWin,
    stateOf,
    waitForDecision,
} from './helpers';

const STARTING_CHIPS = 1000;
const SHOTS = 'storage/e2e-results/screens';

async function threePlayers(browser, viewport) {
    const options = viewport ? { viewport, hasTouch: true } : {};
    const contexts = await Promise.all([browser.newContext(options), browser.newContext(options), browser.newContext(options)]);
    const pages = await Promise.all(contexts.map((context) => context.newPage()));

    return { contexts, pages };
}

async function chipsOn(page, names) {
    const values = await Promise.all(names.map((name) => readNumber(page.getByTestId(`chips-${name}`))));

    return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

test('three browsers play a full game in real time', async ({ browser }) => {
    const { contexts, pages } = await threePlayers(browser);
    const [asha, ben, cal] = pages;
    const names = ['Asha', 'Ben', 'Cal'];
    const socketFrames = [];

    pages.forEach((page) => page.on('websocket', (socket) => socket.on('framereceived', (frame) => socketFrames.push(String(frame.payload)))));

    const code = await createRoom(asha);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    await joinByCode(ben, code, 'Ben');
    await expect(asha.getByTestId('lobby-players')).toContainText('Ben');

    await joinByLink(cal, code, 'Cal');
    await expect(asha.getByTestId('lobby-players')).toContainText('Cal');
    await expect(ben.getByTestId('lobby-players')).toContainText('Cal');

    // Only the host has the Start button.
    await expect(ben.getByRole('button', { name: 'Start Game' })).toHaveCount(0);
    await expect(ben.getByText('Waiting for the host to start the game.')).toBeVisible();

    await asha.getByRole('button', { name: 'Start Game' }).click();

    // Everyone moves from the lobby to the table with no page reload.
    for (const page of pages) {
        await expect(page.getByTestId('pot')).toHaveText(/30/);
        await expect(page.getByTestId('nav-code')).toHaveText(code);
        await expect(page.getByTestId('live')).toBeVisible();
    }

    let settledTurns = 0;

    while (settledTurns < 4) {
        const { page, bet } = await waitForDecision(pages);

        // The active player bets the minimum and everyone invited declines, so one bet decides each turn.
        if (await page.getByTestId('invite-prompt').isVisible()) {
            await clickAction(page, page.getByRole('button', { name: /^Decline\b/ }));
        } else {
            await clickAction(page, bet);
        }

        const { game } = await stateOf(page, code);

        if (game.turn?.stage !== 'reveal') {
            continue;
        }

        const result = game.lastResult;
        const outcome = result.outcomes[0];

        // The server's decision matches an independent calculation from the cards themselves.
        expect(result.won).toBe(shouldWin(result.cards, result.drawn));

        // A win pays from the pot, a loss feeds it, and no chip appears or disappears.
        expect(result.potAfter).toBe(result.won ? result.potBefore - outcome.profit : result.potBefore + outcome.stake);
        expect(outcome.payout).toBe(result.won ? outcome.stake * 2 : 0);

        // The same result reaches all three browsers, live.
        for (const browserPage of pages) {
            await expect(browserPage.getByTestId('result-banner')).toHaveText(result.won ? /In range/ : /Out of range/);
            await expect(browserPage.getByTestId('pot')).toHaveText(new RegExp(result.potAfter.toLocaleString('en-IN')));
        }

        const balances = await chipsOn(asha, names);
        expect(Object.values(balances).reduce((a, b) => a + b, 0) + result.potAfter).toBe(STARTING_CHIPS * 3);

        settledTurns++;

        if (settledTurns === 1) {
            await asha.screenshot({ path: `${SHOTS}/desktop-reveal.png` });
        }

        await expect(asha.getByTestId('result-banner')).toBeHidden({ timeout: 15000 });
    }

    // Pings carry a version number only, never cards or balances.
    const gameFrames = socketFrames.filter((frame) => frame.includes('game:state-updated'));
    expect(gameFrames.length).toBeGreaterThan(0);

    for (const frame of gameFrames) {
        expect(frame).not.toMatch(/deck|hand|chips|"pot"/);
    }

    // The host ends the game and every browser sees the same final standings.
    await asha.getByRole('button', { name: 'Settings' }).click();
    await asha.getByRole('button', { name: 'End Game' }).click();
    await asha.getByRole('dialog').getByRole('button', { name: 'End Game' }).click();

    for (const page of pages) {
        await expect(page.getByTestId('game-over')).toBeVisible();
    }

    await asha.screenshot({ path: `${SHOTS}/desktop-game-over.png`, fullPage: true });
    await Promise.all(contexts.map((context) => context.close()));
});

test('invited players see the prompt, and limits are enforced by the server', async ({ browser }) => {
    const { contexts, pages } = await threePlayers(browser);
    const [asha, ben, cal] = pages;

    const code = await createRoom(asha, { name: 'Invite Table' });
    await joinByCode(ben, code, 'Ben');
    await joinByCode(cal, code, 'Cal');
    await asha.getByRole('button', { name: 'Start Game' }).click();

    const first = await waitForDecision(pages);
    await expect(first.bet).toBeVisible();
    await clickAction(first.page, first.page.getByRole('button', { name: /^Bet\b/ }));

    const second = await waitForDecision(pages);
    expect(second.page).not.toBe(first.page);
    await expect(second.page.getByTestId('invite-prompt')).toContainText('Would you like to participate?');
    await expect(second.page.getByRole('button', { name: 'Custom Amount' })).toBeVisible();
    await second.page.screenshot({ path: `${SHOTS}/desktop-invite.png` });

    await second.page.getByRole('button', { name: 'Custom Amount' }).click();
    const custom = second.page.getByTestId('custom-amount');
    await custom.fill('999999');
    await expect(second.page.getByText(/Choose a whole number/)).toBeVisible();
    await expect(second.page.getByRole('button', { name: /Accept & Bet/ })).toBeDisabled();

    // Bypassing the disabled button still fails at the server.
    const response = await second.page.evaluate(async ([roomCode, key]) => {
        const result = await window.axios.post(`/rooms/${roomCode}/actions`, { action: 'bet', amount: 999999, key }).catch((e) => e.response);

        return { status: result.status, reason: result.data.reason };
    }, [code, crypto.randomUUID()]);
    expect(response).toEqual({ status: 422, reason: 'invalid_amount' });

    // A player out of turn is refused too.
    const bystander = pages.find((page) => page !== second.page);
    const outOfTurn = await bystander.evaluate(async ([roomCode, key]) => {
        const result = await window.axios.post(`/rooms/${roomCode}/actions`, { action: 'bet', amount: 10, key }).catch((e) => e.response);

        return { status: result.status, reason: result.data.reason };
    }, [code, crypto.randomUUID()]);
    expect(outOfTurn).toEqual({ status: 422, reason: 'not_your_turn' });

    await Promise.all(contexts.map((context) => context.close()));
});

test('the deck never reaches a browser, and a player can reconnect to their seat', async ({ browser }) => {
    const { contexts, pages } = await threePlayers(browser);
    const [asha, ben, cal] = pages;

    const code = await createRoom(asha, { name: 'Reconnect Table' });
    await joinByCode(ben, code, 'Ben');
    await joinByCode(cal, code, 'Cal');
    await asha.getByRole('button', { name: 'Start Game' }).click();
    await expect(cal.getByTestId('pot')).toBeVisible();

    const state = await cal.evaluate(async (roomCode) => (await window.axios.get(`/rooms/${roomCode}/state`)).data, code);
    expect(state.game.deck).toBeUndefined();
    expect(state.game.discard).toBeUndefined();
    expect(state.game.deckCount).toBe(46);

    // Ben's connection drops: their seat shows as disconnected for the others.
    await ben.close();
    await expect(asha.getByTestId('seat-Ben').getByLabel('Disconnected')).toBeVisible({ timeout: 30000 });

    // Opening the link again restores the same seat with the same cards, with no re-joining.
    const handBefore = state.game.players.find((player) => player.name === 'Ben').hand;
    const benAgain = await contexts[1].newPage();
    await benAgain.goto(`/join/${code}`);
    await expect(benAgain.getByTestId('nav-code')).toHaveText(code);

    const restored = await benAgain.evaluate(async (roomCode) => (await window.axios.get(`/rooms/${roomCode}/state`)).data, code);
    expect(restored.game.players.find((player) => player.id === restored.you).hand).toEqual(handBefore);
    await expect(asha.getByTestId('seat-Ben').getByLabel('Disconnected')).toHaveCount(0, { timeout: 30000 });

    await Promise.all(contexts.map((context) => context.close()));
});

test('simultaneous requests on two servers apply exactly once', async ({ browser }) => {
    const { contexts, pages } = await threePlayers(browser);
    const [asha, ben, cal] = pages;
    const code = await createRoom(asha, { name: 'Concurrency Table' });
    await joinByCode(ben, code, 'Ben');
    await joinByCode(cal, code, 'Cal');
    await asha.getByRole('button', { name: 'Start Game' }).click();

    const { page } = await waitForDecision(pages);
    const context = page.context();
    const state = await page.evaluate(async (roomCode) => (await window.axios.get(`/rooms/${roomCode}/state`)).data, code);
    const xsrf = decodeURIComponent((await context.cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN').value);
    const send = (port, key, amount = 10) => context.request.post(`http://127.0.0.1:${port}/rooms/${code}/actions`, {
        headers: { 'X-XSRF-TOKEN': xsrf, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        data: { action: 'bet', amount, key },
        failOnStatusCode: false,
    });

    // The same player double-submits with different keys, split across both servers.
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => send(i % 2 ? 8124 : 8123, crypto.randomUUID())));
    const statuses = responses.map((response) => response.status());
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 422)).toHaveLength(11);

    const after = await page.evaluate(async (roomCode) => (await window.axios.get(`/rooms/${roomCode}/state`)).data, code);
    expect(after.game.turn.bets.filter((bet) => bet.playerId === state.you)).toHaveLength(1);
    expect(after.game.players.find((player) => player.id === state.you).chips).toBe(state.game.players.find((player) => player.id === state.you).chips - 10);

    // One retried request, with one key, replayed on both servers at once.
    const actor = after.game.turn.askedId;
    const next = pages.find((candidate) => candidate !== page);
    const nextContext = (await next.evaluate(async (roomCode) => (await window.axios.get(`/rooms/${roomCode}/state`)).data, code)).you === actor
        ? next.context()
        : pages.find((candidate) => candidate !== page && candidate !== next).context();
    const nextXsrf = decodeURIComponent((await nextContext.cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN').value);
    const key = crypto.randomUUID();
    const retried = await Promise.all([8123, 8124, 8123, 8124].map((port) => nextContext.request.post(`http://127.0.0.1:${port}/rooms/${code}/actions`, {
        headers: { 'X-XSRF-TOKEN': nextXsrf, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        data: { action: 'pass', key },
        failOnStatusCode: false,
    })));

    const bodies = await Promise.all(retried.map((response) => response.json()));
    expect(retried.every((response) => response.status() === 200)).toBe(true);
    expect(bodies.filter((body) => body.duplicate === false)).toHaveLength(1);
    expect(bodies.filter((body) => body.duplicate === true)).toHaveLength(3);

    await Promise.all(contexts.map((c) => c.close()));
});

test('host reset shows everyone the round summary, then deals a new round', async ({ browser }) => {
    const { contexts, pages } = await threePlayers(browser);
    const [asha, ben, cal] = pages;

    const code = await createRoom(asha, { name: 'Reset Table' });
    await joinByCode(ben, code, 'Ben');
    await joinByCode(cal, code, 'Cal');
    await asha.getByRole('button', { name: 'Start Game' }).click();
    await waitForDecision(pages);

    const before = await stateOf(asha, code);

    await asha.getByRole('button', { name: 'Settings' }).click();
    await asha.getByRole('button', { name: 'Reset Round' }).click();
    await asha.getByRole('dialog').getByRole('button', { name: 'Reset Round' }).click();

    for (const page of pages) {
        await expect(page.getByTestId('summary-reason')).toHaveText(/The host reset the round/);
    }

    await asha.screenshot({ path: `${SHOTS}/desktop-summary.png` });

    // The summary closes itself when the next round starts, so it offers no close button.
    await expect(asha.getByRole('dialog').getByRole('button', { name: 'Close' })).toHaveCount(0);

    // Only the host can deal, and others see the countdown.
    await expect(ben.getByRole('button', { name: /Deal Next Round/ })).toHaveCount(0);
    await asha.getByRole('button', { name: /Deal Next Round/ }).click();

    for (const page of pages) {
        await expect(page.getByTestId('summary-reason')).toBeHidden();
        await expect(page.getByText('Round 2')).toBeVisible();
    }

    const after = await stateOf(asha, code);
    const hands = (state) => state.game.players.map((player) => player.hand);

    // Fresh cards, the start moved one seat clockwise, and contributions joined the leftover pot.
    expect(hands(after)).not.toEqual(hands(before));
    expect(after.game.pot).toBe(before.game.pot + 30);
    expect(after.game.deckCount).toBe(46);

    const ids = before.game.players.map((player) => player.id);
    const previousStart = ids.indexOf(before.game.round.startingPlayerId);
    expect(after.game.round.startingPlayerId).toBe(ids[(previousStart + 1) % ids.length]);

    await Promise.all(contexts.map((context) => context.close()));
});

test('custom rules chosen in the wizard apply at the table', async ({ browser }) => {
    const { contexts, pages } = await threePlayers(browser);
    const [asha, ben, cal] = pages;

    const code = await createRoom(asha, {
        name: 'Custom Table',
        settings: async (page) => {
            await page.getByRole('button', { name: 'Custom Game' }).click();
            await page.getByRole('button', { name: 'Next' }).click();
            await page.getByLabel('Starting chips').fill('500');
            await page.getByRole('button', { name: 'Next' }).click();
            await page.getByLabel('Winning multiplier').fill('3');
            await page.getByRole('button', { name: 'Next' }).click();
            await page.getByLabel("Other players' cards").selectOption('hidden');
            await page.getByRole('button', { name: 'Back' }).click();
            await page.getByRole('button', { name: 'Back' }).click();
            await page.getByRole('button', { name: 'Back' }).click();
        },
    });

    await joinByCode(ben, code, 'Ben');
    await joinByCode(cal, code, 'Cal');
    await asha.getByRole('button', { name: 'Start Game' }).click();

    const { page } = await waitForDecision(pages);

    // At 3x a pot of 30 can only fund a stake of 15, and the starting chips were applied.
    await expect(page.getByTestId('available')).toHaveText('15');
    await expect(page.getByTestId('chips-Ben')).toHaveText('490');

    // The hand of a player who isn't active stays off the wire, not merely off the screen.
    const state = await stateOf(page, code);
    const hidden = state.game.players.filter((player) => player.id !== state.you && player.id !== state.game.turn.activeId);
    expect(hidden.length).toBeGreaterThan(0);
    hidden.forEach((player) => expect(player.hand).toBeNull());

    await Promise.all(contexts.map((context) => context.close()));
});

test('a registered player can open the restyled profile page', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();

    await page.goto('/register');
    await page.getByLabel('Name').fill('Profile Tester');
    await page.getByLabel('Email').fill(`tester-${crypto.randomUUID()}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery');
    await page.getByLabel('Confirm Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Register' }).click();

    await page.getByRole('link', { name: 'Profile Tester' }).click();
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profile Information' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Delete Account' })).toBeVisible();
    await assertNoHorizontalOverflow(page, 'Profile');
    await page.screenshot({ path: `${SHOTS}/profile.png`, fullPage: true });

    await context.close();
});

test('twelve players fit on a small phone without overlapping', async ({ browser }) => {
    const phone = { width: 360, height: 640 };
    const contexts = await Promise.all(Array.from({ length: 12 }, () => browser.newContext({ viewport: phone, hasTouch: true })));
    const pages = await Promise.all(contexts.map((context) => context.newPage()));

    const code = await createRoom(pages[0], {
        name: 'Full Table',
        settings: async (page) => {
            await page.getByRole('button', { name: 'Next' }).click();
            await page.getByLabel('Maximum players').fill('12');
            await page.getByRole('button', { name: 'Back' }).click();
        },
    });

    for (let i = 1; i < 12; i++) {
        await joinByLink(pages[i], code, `Player ${i + 1}`);
    }

    await pages[0].getByRole('button', { name: 'Start Game' }).click();
    const { page } = await waitForDecision(pages);
    await expect(page.locator('[data-testid^="seat-"]')).toHaveCount(12);
    await assertSeatsDoNotOverlap(page, 'Twelve seats, player acting');
    await page.screenshot({ path: `${SHOTS}/phone-small-12-acting.png` });

    const viewer = pages.find((candidate) => candidate !== page);
    await expect(viewer.getByTestId('waiting')).toBeVisible();
    await assertNoHorizontalOverflow(viewer, 'Twelve seats');
    await assertSeatsDoNotOverlap(viewer, 'Twelve seats, watching');
    await viewer.screenshot({ path: `${SHOTS}/phone-small-12-waiting.png` });

    await Promise.all(contexts.map((context) => context.close()));
});

test('every screen fits a phone, with eight players at the table', async ({ browser }) => {
    const phone = { width: 390, height: 844 };
    const contexts = await Promise.all(Array.from({ length: 8 }, () => browser.newContext({ viewport: phone, hasTouch: true })));
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    const [host] = pages;

    await host.goto('/');
    await assertNoHorizontalOverflow(host, 'Home');
    await host.screenshot({ path: `${SHOTS}/phone-home.png`, fullPage: true });

    await host.goto('/how-to-play');
    await assertNoHorizontalOverflow(host, 'How to Play');

    await host.goto('/rooms/create');
    await assertNoHorizontalOverflow(host, 'Create');
    await host.getByLabel('Room name').fill('Eight Seats');
    await host.getByLabel('Your display name').fill('Asha');

    for (let step = 0; step < 3; step++) {
        await host.getByRole('button', { name: 'Next' }).click();
        await assertNoHorizontalOverflow(host, `Create step ${step + 2}`);
        await host.screenshot({ path: `${SHOTS}/phone-create-${step + 2}.png`, fullPage: true });
    }

    await host.getByRole('button', { name: 'Next' }).click();
    await assertNoHorizontalOverflow(host, 'Create review');
    await host.getByRole('button', { name: 'Create Room' }).click();
    await expect(host.getByTestId('room-code')).toBeVisible();
    const code = (await host.getByTestId('room-code').textContent()).trim();

    for (let i = 1; i < 8; i++) {
        await joinByLink(pages[i], code, `Player ${i + 1}`);
    }

    await expect(host.getByTestId('lobby-players').locator('li')).toHaveCount(8);
    await assertNoHorizontalOverflow(host, 'Lobby');
    await host.screenshot({ path: `${SHOTS}/phone-lobby.png`, fullPage: true });

    await host.getByRole('button', { name: 'Start Game' }).click();
    await expect(pages[3].getByTestId('pot')).toHaveText(/80/);
    await assertNoHorizontalOverflow(pages[3], 'Table');
    await pages[3].screenshot({ path: `${SHOTS}/phone-table-8.png` });

    const { page, bet } = await waitForDecision(pages);
    await assertNoHorizontalOverflow(page, 'Betting panel');
    await assertSeatsDoNotOverlap(page, 'Eight seats');
    await page.screenshot({ path: `${SHOTS}/phone-betting.png` });

    // Primary controls meet the 44px touch-target guideline.
    const box = await bet.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);

    // Nothing important is cut off: the panel's actions stay within the viewport.
    expect(box.y + box.height).toBeLessThanOrEqual(phone.height);

    await Promise.all(contexts.map((context) => context.close()));
});
