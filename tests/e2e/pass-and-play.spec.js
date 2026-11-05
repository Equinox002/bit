import { expect, test } from '@playwright/test';
import { assertBetsStayClear, assertNoHorizontalOverflow, assertSeatsDoNotOverlap, readNumber } from './helpers';

const SHOTS = 'storage/e2e-results/screens';

async function waitForOfflineReady(page) {
    await page.waitForFunction(async () => {
        const registration = await navigator.serviceWorker?.ready;
        const stored = await caches.match('/pass-and-play');

        return Boolean(registration?.active && stored);
    }, null, { timeout: 30000 });
}

async function fillNames(page, names) {
    for (let i = 3; i < names.length; i++) {
        await page.getByRole('button', { name: 'Add Player' }).click();
    }

    for (let i = 0; i < names.length; i++) {
        await page.getByLabel(`Player ${i + 1} name`).fill(names[i]);
    }
}

function decide(page) {
    return page.getByRole('button', { name: /^(Bet|Accept & Bet)\b/ });
}

/**
 * Plays until a card has been revealed, with the player who bets first and everyone else declining.
 */
async function playOneTurn(page) {
    await expect(page.getByRole('button', { name: /^(Skip|Decline)\b/ })).toBeVisible();
    await decide(page).click();

    const banner = page.getByTestId('result-banner');

    await expect(async () => {
        const decline = page.getByRole('button', { name: /^Decline\b/ });

        if (await decline.isVisible()) {
            await decline.click();
        }

        await expect(banner).toBeVisible({ timeout: 300 });
    }).toPass({ timeout: 15000 });

    return banner;
}

test('a game plays and resumes with no network at all', async ({ page, context }) => {
    const requests = [];

    await page.goto('/');
    await waitForOfflineReady(page);
    await assertNoHorizontalOverflow(page, 'Home');
    await page.getByRole('link', { name: 'Pass & Play' }).click();
    await expect(page.getByRole('heading', { name: 'Pass & Play' })).toBeVisible();

    // From here on, no request can reach the server.
    await context.setOffline(true);
    page.on('request', (request) => {
        if (/\/(rooms|join|api)\b/.test(request.url())) {
            requests.push(request.url());
        }
    });

    await page.reload();
    await expect(page.getByTestId('offline-badge')).toBeVisible();

    await fillNames(page, ['Asha', 'Ben', 'Cal']);
    await page.getByRole('button', { name: 'Start Game' }).click();

    await expect(page.getByTestId('nav-code')).toHaveText('PASS & PLAY');
    await expect(page.getByTestId('pot')).toHaveText(/30/);
    await expect(page.getByTestId('deck-count')).toHaveText('46');
    await assertSeatsDoNotOverlap(page, 'Three players');
    await page.screenshot({ path: `${SHOTS}/local-table.png` });

    // The betting prompt names who should be holding the device.
    await expect(page.getByTestId('own-prompt')).toContainText(/(Asha|Ben|Cal)'s turn\./);

    const banner = await playOneTurn(page);
    await page.screenshot({ path: `${SHOTS}/local-reveal.png` });
    const won = (await banner.textContent()).includes('In range');
    const pot = await readNumber(page.getByTestId('pot'));
    expect(pot).toBe(won ? 20 : 40);

    const chips = await Promise.all(['Asha', 'Ben', 'Cal'].map((name) => readNumber(page.getByTestId(`chips-${name}`))));
    expect(chips.reduce((a, b) => a + b, 0) + pot).toBe(3000);

    // The next turn starts by itself after the reveal.
    await expect(banner).toBeHidden({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /^(Skip|Decline)\b/ })).toBeVisible();

    // Closing the page mid-game loses nothing, still offline.
    const deck = await page.getByTestId('deck-count').textContent();
    await page.reload();
    await expect(page.getByText('Game in progress')).toBeVisible();
    await page.getByRole('button', { name: 'Resume Game' }).click();
    await expect(page.getByTestId('pot')).toHaveText(new RegExp(String(pot)));
    await expect(page.getByTestId('deck-count')).toHaveText(deck);

    // Opening another address offline leads to the game too.
    await page.goto('/');
    await expect(page.getByText('Game in progress')).toBeVisible();

    await page.getByRole('button', { name: 'Resume Game' }).click();

    // Ending the game shows standings, and New Game returns to a clean setup.
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'End Game' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'End Game' }).click();
    await expect(page.getByTestId('game-over')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/local-game-over.png`, fullPage: true });
    await page.getByRole('button', { name: 'New Game' }).click();
    await expect(page.getByText('Game in progress')).toHaveCount(0);

    expect(requests).toEqual([]);
});

test('hidden cards stay hidden behind a pass screen', async ({ page }) => {
    await page.goto('/pass-and-play');
    await fillNames(page, ['Asha', 'Ben', 'Cal']);
    await page.getByRole('button', { name: 'Change rules' }).click();
    await page.getByLabel("Other players' cards").selectOption('hidden');
    await page.getByRole('button', { name: 'Start Game' }).click();

    // Nothing but the name is shown until the player takes the device.
    const handoff = page.getByTestId('handoff');
    await expect(handoff).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/local-handoff.png` });
    const faceDownBefore = await page.getByLabel('Face-down card').count();
    const firstName = (await handoff.locator('p').nth(1).textContent()).trim();

    await page.getByRole('button', { name: `I'm ${firstName}` }).click();
    await expect(handoff).toBeHidden();

    // After the first player acts, the screen returns before the next player's cards show.
    await page.getByRole('button', { name: /^(Skip|Bet)\b/ }).first().click();
    await expect(handoff).toBeVisible();
    const secondName = (await handoff.locator('p').nth(1).textContent()).trim();
    expect(secondName).not.toBe(firstName);

    // Only the active player's hand and the player's own are ever face up on the table.
    await page.getByRole('button', { name: `I'm ${secondName}` }).click();
    await expect(page.getByTestId('invite-prompt').or(page.getByTestId('own-prompt'))).toContainText(secondName);
    expect(faceDownBefore).toBeGreaterThan(0);

    // Reopening the game asks again, because someone else may have picked up the device.
    await page.reload();
    await page.getByRole('button', { name: 'Resume Game' }).click();
    await expect(handoff).toBeVisible();
    await expect(page.getByRole('button', { name: `I'm ${secondName}` })).toBeVisible();
});

test('a game can start from a phone with twelve players, and bad input is explained', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true });
    const page = await context.newPage();

    await page.goto('/pass-and-play');
    await assertNoHorizontalOverflow(page, 'Setup');
    await page.screenshot({ path: `${SHOTS}/local-setup.png`, fullPage: true });

    await page.getByRole('button', { name: 'Start Game' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter at least two player names.');

    await page.getByLabel('Player 1 name').fill('Sam');
    await page.getByLabel('Player 2 name').fill('sam');
    await page.getByRole('button', { name: 'Start Game' }).click();
    await expect(page.getByRole('alert')).toHaveText('Each player needs a different name.');

    await page.getByLabel('Player 2 name').fill('Kim');
    await page.getByRole('button', { name: 'Change rules' }).click();
    await page.getByLabel('Minimum bet', { exact: true }).fill('5000');
    await page.getByRole('button', { name: 'Start Game' }).click();
    await expect(page.getByText('The minimum bet cannot exceed the starting chips.')).toBeVisible();
    await page.getByLabel('Minimum bet', { exact: true }).fill('10');

    await fillNames(page, Array.from({ length: 12 }, (_, i) => `Player ${i + 1}`));
    await expect(page.getByRole('button', { name: 'Add Player' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start Game' }).click();

    await expect(page.getByTestId('pot')).toHaveText(/120/);
    await assertNoHorizontalOverflow(page, 'Twelve seats');
    await assertSeatsDoNotOverlap(page, 'Twelve seats');
    await page.screenshot({ path: `${SHOTS}/local-12.png` });

    await context.close();
});

test('chips build a bet, land on the felt, and settle into the pot or back to the player', async ({ browser }) => {
    for (const [label, viewport, seats] of [
        ['Phone', { width: 390, height: 844 }, 3],
        ['Crowded phone', { width: 360, height: 640 }, 12],
        ['Desktop', { width: 1280, height: 720 }, 3],
    ]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();

        await page.goto('/pass-and-play');
        await fillNames(page, Array.from({ length: seats }, (_, i) => `Player ${i + 1}`));
        await page.getByRole('button', { name: 'Start Game' }).click();
        await expect(page.getByRole('button', { name: /^Bet\b/ })).toBeVisible();
        await expect(page.getByTestId('pot-chips')).toBeVisible();

        // The lowest chip adds to the minimum bet, and the felt previews it before it is committed.
        await page.getByTestId('add-chip-10').click();
        await expect(page.getByRole('button', { name: /^Bet\b/ })).toHaveText(/Bet 20/);
        await expect(page.getByTestId('bet-preview')).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/chips-${label.toLowerCase().replace(' ', '-')}-preview.png` });

        // Min always takes the amount back down.
        await page.getByRole('button', { name: /^Min/ }).click();
        await expect(page.getByRole('button', { name: /^Bet\b/ })).toHaveText(/Bet 10/);
        await page.waitForTimeout(400);
        await assertBetsStayClear(page, `${label}, preview`);
        await page.getByTestId('add-chip-10').click();
        await page.getByRole('button', { name: /^Bet\b/ }).click();

        const stack = page.locator('[data-testid^="bet-Player"]');
        await expect(stack).toHaveCount(1);
        await page.waitForTimeout(500);
        await assertBetsStayClear(page, `${label}, bet placed`);
        await assertSeatsDoNotOverlap(page, `${label}, bet placed`);
        await page.screenshot({ path: `${SHOTS}/chips-${label.toLowerCase().replace(' ', '-')}-bet.png` });

        // Everyone else declines, the card is drawn, and the bet moves on from the felt.
        const banner = page.getByTestId('result-banner');

        await expect(async () => {
            const decline = page.getByRole('button', { name: /^Decline\b/ });

            if (await decline.isVisible()) {
                await decline.click();
            }

            await expect(banner).toBeVisible({ timeout: 300 });
        }).toPass({ timeout: 15000 });

        await page.waitForTimeout(450);
        await page.screenshot({ path: `${SHOTS}/chips-${label.toLowerCase().replace(' ', '-')}-settling.png` });
        await expect(banner).toBeHidden({ timeout: 10000 });
        await expect(stack).toHaveCount(0);

        await context.close();
    }
});

test('a phone held sideways keeps the table in view, beside the betting panel', async ({ browser }) => {
    for (const [viewport, seats] of [
        [{ width: 844, height: 390 }, 3],
        [{ width: 844, height: 390 }, 8],
        [{ width: 667, height: 375 }, 12],
    ]) {
        const context = await browser.newContext({ viewport, hasTouch: true });
        const page = await context.newPage();

        await page.goto('/pass-and-play');
        await fillNames(page, Array.from({ length: seats }, (_, i) => `P${i + 1}`));
        await page.getByRole('button', { name: 'Start Game' }).click();
        await expect(page.getByRole('button', { name: /^Bet\b/ })).toBeVisible();
        await page.waitForTimeout(300);
        await assertNoHorizontalOverflow(page, `${seats} seats sideways`);
        await assertBetsStayClear(page, `${seats} seats sideways`);
        await page.screenshot({ path: `${SHOTS}/sideways-${seats}.png` });

        const { table, panel, seatBoxes, cards, pot, bet } = await page.evaluate(() => {
            const box = (element) => {
                const { x, y, width, height } = element.getBoundingClientRect();

                return { x, y, width, height };
            };

            return {
                table: box(document.querySelector('.table-room')),
                panel: box(document.querySelector('[data-testid="betting-panel"]')),
                seatBoxes: [...document.querySelectorAll('[data-testid^="seat-"]')].map(box),
                cards: box(document.querySelector('[data-testid="center-cards"]')),
                pot: box(document.querySelector('[data-testid="pot"]')),
                bet: box([...document.querySelectorAll('[data-testid="betting-panel"] button')].find((button) => /^Bet\b/.test(button.textContent))),
            };
        });
        const collide = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

        // The table gets the full height, with everything in it visible and clear of the panel.
        expect(table.height, `${seats} seats: table height`).toBeGreaterThan(280);
        expect(cards.y + cards.height, `${seats} seats: cards fit`).toBeLessThanOrEqual(table.y + table.height);
        expect(pot.y, `${seats} seats: pot fits`).toBeGreaterThanOrEqual(table.y);
        expect(bet.y + bet.height, `${seats} seats: Bet button reachable`).toBeLessThanOrEqual(viewport.height);

        seatBoxes.forEach((seat, index) => {
            expect(seat.x + seat.width, `${seats} seats: seat ${index} clear of the panel`).toBeLessThanOrEqual(panel.x);
            expect(seat.y, `${seats} seats: seat ${index} top`).toBeGreaterThanOrEqual(table.y);
            expect(seat.y + seat.height, `${seats} seats: seat ${index} bottom`).toBeLessThanOrEqual(table.y + table.height);
            expect(collide(seat, cards), `${seats} seats: seat ${index} on the cards`).toBe(false);
            expect(collide(seat, pot), `${seats} seats: seat ${index} on the pot`).toBe(false);
        });

        await context.close();
    }
});

test('a winning bet is paid out in chips, and every bet leaves the felt', async ({ page }) => {
    test.setTimeout(180000);

    await page.goto('/pass-and-play');
    await fillNames(page, ['Asha', 'Ben', 'Cal']);
    await page.getByRole('button', { name: 'Start Game' }).click();

    const banner = page.getByTestId('result-banner');
    const opacity = (locator) => locator.evaluate((element) => Number(getComputedStyle(element).opacity));
    const deadline = Date.now() + 150000;
    let won = false;

    // Bets every turn until the draw goes the player's way. The deck is random, so this can take a few.
    while (!won && Date.now() < deadline) {
        const deal = page.getByRole('button', { name: /Deal Next Round/ });
        const bet = page.getByRole('button', { name: /^Bet\b/ });
        const decline = page.getByRole('button', { name: /^Decline\b/ });

        if (await deal.isVisible()) {
            await deal.click();
        } else if (await bet.isVisible()) {
            await bet.click();
        } else if (await decline.isVisible()) {
            await decline.click();
        } else if (await banner.isVisible()) {
            won = (await banner.textContent()).includes('In range');

            if (!won) {
                await expect(banner).toBeHidden({ timeout: 10000 });
            }
        }

        await page.waitForTimeout(100);
    }

    expect(won, 'A bet should win within the time allowed').toBe(true);

    // The profit comes from the pot while the stake returns to the seat, and both then fade away.
    const payout = page.getByTestId('payout');
    const stack = page.locator('[data-testid^="bet-"]');

    await expect(payout).toHaveCount(1);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/chips-win.png` });
    await expect.poll(() => opacity(payout), { timeout: 3000 }).toBeLessThan(0.05);
    await expect.poll(() => opacity(stack.first()), { timeout: 3000 }).toBeLessThan(0.05);
});

test('when everyone skips a full cycle, new cards are dealt and the pot carries over', async ({ page }) => {
    await page.goto('/pass-and-play');
    await fillNames(page, ['Asha', 'Ben', 'Cal']);
    await page.getByRole('button', { name: 'Start Game' }).click();
    await expect(page.getByTestId('pot')).toHaveText(/30/);

    const summary = page.getByTestId('summary-reason');

    await expect(async () => {
        const pass = page.getByRole('button', { name: /^(Skip|Decline)\b/ });

        if (await pass.isVisible()) {
            await pass.click();
        }

        await expect(summary).toBeVisible({ timeout: 100 });
    }).toPass({ timeout: 20000 });

    await expect(summary).toHaveText(/Nobody bet for a full cycle/);
    await expect(page.getByTestId('next-round-note')).toHaveText('The 30 chips left in the pot carry into the next round, and each player adds 10 chips.');
    await page.screenshot({ path: `${SHOTS}/local-no-bets.png` });

    await page.getByRole('button', { name: /Deal Next Round/ }).click();
    await expect(page.getByText('Round 2')).toBeVisible();
    await expect(page.getByTestId('pot')).toHaveText(/60/);
    await expect(page.getByTestId('chips-Asha')).toHaveText('980');
});

test('a new round follows the same rules as online play', async ({ page }) => {
    await page.goto('/pass-and-play');
    await fillNames(page, ['Asha', 'Ben', 'Cal']);
    await page.getByRole('button', { name: 'Start Game' }).click();
    await expect(page.getByTestId('pot')).toHaveText(/30/);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Reset Round' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset Round' }).click();

    await expect(page.getByTestId('summary-reason')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/local-summary.png` });
    await page.getByRole('button', { name: /Deal Next Round/ }).click();
    await expect(page.getByText('Round 2')).toBeVisible();
    await expect(page.getByTestId('pot')).toHaveText(/60/);
    await expect(page.getByTestId('deck-count')).toHaveText('46');
});
