import { expect } from '@playwright/test';

export async function createRoom(page, { name = 'E2E Table', host = 'Asha', settings } = {}) {
    await page.goto('/rooms/create');
    await page.getByLabel('Room name').fill(name);
    await page.getByLabel('Your display name').fill(host);

    if (settings) {
        await settings(page);
    }

    await page.getByRole('button', { name: 'Skip to Review' }).click();
    await page.getByRole('button', { name: 'Create Room' }).click();
    await expect(page.getByTestId('room-code')).toBeVisible();

    return (await page.getByTestId('room-code').textContent()).trim();
}

export async function joinByCode(page, code, name) {
    await page.goto('/join');
    await page.getByLabel('Room code').fill(code);
    await page.getByRole('button', { name: 'Find Room' }).click();
    await page.getByLabel('Your display name').fill(name);
    await page.getByRole('button', { name: 'Take a Seat' }).click();
    await expect(page.getByTestId('room-code')).toBeVisible();
}

export async function joinByLink(page, code, name) {
    await page.goto(`/join/${code}`);
    await page.getByLabel('Your display name').fill(name);
    await page.getByRole('button', { name: 'Take a Seat' }).click();
    await expect(page.getByTestId('room-code')).toBeVisible();
}

const BET_BUTTON = /^(Bet|Accept & Bet)\b/;

/**
 * Finds which browser the game is waiting on, dealing the next round if the host needs to.
 */
export async function waitForDecision(pages, timeout = 45000) {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        for (const page of pages) {
            const deal = page.getByRole('button', { name: /Deal Next Round/ });

            // Another browser may deal first, and then this button is gone for good.
            if (await deal.isVisible().catch(() => false)) {
                await deal.click({ timeout: 1000 }).catch(() => {});
            }

            const bet = page.getByRole('button', { name: BET_BUTTON });
            const pass = page.getByRole('button', { name: /^(Skip|Decline)\b/ });

            // While a request is in flight the buttons are disabled, so that page isn't deciding.
            if ((await pass.isVisible().catch(() => false)) && (await pass.isEnabled().catch(() => false))) {
                return { page, bet, pass };
            }
        }

        await pages[0].waitForTimeout(150);
    }

    throw new Error('No browser was asked to act in time.');
}

/**
 * Clicks a game button and waits until the server has answered.
 */
export async function clickAction(page, button) {
    await Promise.all([
        page.waitForResponse((response) => response.url().includes('/actions')),
        button.click(),
    ]);
}

export async function stateOf(page, code) {
    return page.evaluate(async (roomCode) => (await window.axios.get(`/rooms/${roomCode}/state`)).data, code);
}

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * An independent check of the server's decision, using the default rules: Ace low, strictly
 * between, suits ignored.
 */
export function shouldWin(cards, drawn) {
    const value = (card) => RANKS.indexOf(card.slice(0, -1));
    const [low, high] = [value(cards[0]), value(cards[1])].sort((a, b) => a - b);

    return value(drawn) > low && value(drawn) < high;
}

export async function readNumber(locator) {
    return Number((await locator.textContent()).replace(/[^\d]/g, ''));
}

export async function potOn(page) {
    return readNumber(page.getByTestId('pot'));
}

/**
 * Everything on the table measured in one moment. A live game can move on between separate
 * measurements, which would compare a seat from one layout with a panel from another.
 */
function tableBoxes(page) {
    return page.evaluate(() => {
        const box = (element) => {
            const { x, y, width, height } = element.getBoundingClientRect();

            return { x, y, width, height };
        };
        const one = (id) => box(document.querySelector(`[data-testid="${id}"]`));
        const all = (prefix) => [...document.querySelectorAll(`[data-testid^="${prefix}"]`)].map(box);

        return {
            panelTop: one('betting-panel').y,
            pot: one('pot'),
            cards: one('center-cards'),
            ladder: one('rank-ladder'),
            seats: all('seat-'),
            stacks: all('bet-'),
        };
    });
}

/**
 * Every seat must be fully on screen, above the betting panel, and clear of the other seats and
 * the pot.
 */
export async function assertSeatsDoNotOverlap(page, label) {
    const viewport = page.viewportSize();
    const { panelTop, seats, pot } = await tableBoxes(page);
    const collide = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

    seats.forEach((seat, index) => {
        expect(seat.x, `${label}: seat ${index} left edge`).toBeGreaterThanOrEqual(0);
        expect(seat.x + seat.width, `${label}: seat ${index} right edge`).toBeLessThanOrEqual(viewport.width);
        expect(seat.y + seat.height, `${label}: seat ${index} bottom edge`).toBeLessThanOrEqual(panelTop);
        expect(collide(seat, pot), `${label}: seat ${index} covers the pot`).toBe(false);

        seats.slice(index + 1).forEach((other, offset) => {
            expect(collide(seat, other), `${label}: seats ${index} and ${index + offset + 1} overlap`).toBe(false);
        });
    });
}

/**
 * Chips on the felt must stay on screen and leave the pot and cards readable.
 */
export async function assertBetsStayClear(page, label) {
    const viewport = page.viewportSize();
    const { stacks, pot, cards, ladder } = await tableBoxes(page);
    const blockers = [pot, cards, ladder];
    const collide = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

    expect(stacks.length, `${label}: chips are on the felt`).toBeGreaterThan(0);

    stacks.forEach((stack, index) => {
        expect(stack.x, `${label}: stack ${index} left edge`).toBeGreaterThanOrEqual(0);
        expect(stack.x + stack.width, `${label}: stack ${index} right edge`).toBeLessThanOrEqual(viewport.width);
        blockers.forEach((blocker) => expect(collide(stack, blocker), `${label}: stack ${index} covers the pot or cards`).toBe(false));
    });
}

export async function assertNoHorizontalOverflow(page, label) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${label} should not scroll sideways`).toBeLessThanOrEqual(0);
}
