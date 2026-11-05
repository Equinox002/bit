// The JavaScript copy of the rules in app/Game, used by offline pass-and-play.
// Online games never use this: the server decides them. tests/js/engine.test.mjs replays recorded
// PHP games through this code, so a rule changed on only one side fails the tests.

export const SUITS = ['H', 'D', 'C', 'S'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export class GameRuleError extends Error {
    constructor(reason, message) {
        super(message);
        this.reason = reason;
    }
}

export const rankOf = (card) => card.slice(0, -1);

export function cardValue(card, aceHigh = false) {
    const index = RANKS.indexOf(rankOf(card));

    if (index === -1) {
        throw new Error(`Unknown card [${card}].`);
    }

    return index === 0 && aceHigh ? 14 : index + 1;
}

export function standardDeck() {
    return SUITS.flatMap((suit) => RANKS.map((rank) => rank + suit));
}

function secureInt(exclusiveMax) {
    // Rejecting the top of the range keeps every outcome equally likely.
    const limit = Math.floor(0x100000000 / exclusiveMax) * exclusiveMax;
    const buffer = new Uint32Array(1);

    do {
        globalThis.crypto.getRandomValues(buffer);
    } while (buffer[0] >= limit);

    return buffer[0] % exclusiveMax;
}

export const secureRandomizer = {
    shuffle(cards) {
        const shuffled = [...cards];

        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = secureInt(i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        return shuffled;
    },
    pick(items) {
        return items[secureInt(items.length)];
    },
};

export function winningValues(first, second, settings) {
    const a = cardValue(first, settings.aceHigh);
    const b = cardValue(second, settings.aceHigh);
    const [low, high] = [Math.min(a, b), Math.max(a, b)];
    const from = settings.inclusiveBoundaries ? low : low + 1;
    const to = settings.inclusiveBoundaries ? high : high - 1;
    const values = [];

    for (let value = from; value <= to; value++) {
        values.push(value);
    }

    return values;
}

export const rangeGap = (first, second, settings) => winningValues(first, second, settings).length;

export function cardWins(drawn, first, second, settings) {
    return winningValues(first, second, settings).includes(cardValue(drawn, settings.aceHigh));
}

export function rangeLabel(first, second, settings) {
    return cardValue(first, settings.aceHigh) <= cardValue(second, settings.aceHigh)
        ? `${rankOf(first)}–${rankOf(second)}`
        : `${rankOf(second)}–${rankOf(first)}`;
}

export function clockwiseAfter(seats, id) {
    const index = seats.indexOf(id);

    return index === -1 ? seats : [...seats.slice(index + 1), ...seats.slice(0, index + 1)];
}

export function nextAfter(seats, id, among) {
    return clockwiseAfter(seats, id).find((candidate) => among.includes(candidate)) ?? null;
}

export function startingFrom(seats, start, among) {
    return [start, ...clockwiseAfter(seats, start).filter((candidate) => candidate !== start && among.includes(candidate))];
}

export const betProfit = (stake, multiplier) => Math.floor((stake * (multiplier - 100)) / 100);

export function availableStake(pot, stakes, multiplier) {
    const remaining = stakes.reduce((left, stake) => left - betProfit(stake, multiplier), pot);

    return remaining <= 0 ? 0 : Math.floor(((remaining + 1) * 100 - 1) / (multiplier - 100));
}

export function betLimits(pot, stakes, chips, settings) {
    const available = availableStake(pot, stakes, settings.multiplier);

    if (available <= 0) {
        return null;
    }

    const min = Math.min(settings.minBet, available);
    let max = Math.min(available, chips);

    if (settings.maxBet > 0) {
        max = Math.min(max, settings.maxBet);
    }

    return max < min ? null : { min, max, available };
}

export function narrowRangeTriggered(hands, settings) {
    if (!settings.autoReset || hands.length === 0) {
        return false;
    }

    const narrow = hands.filter(([first, second]) => rangeGap(first, second, settings) <= settings.narrowMaxGap).length;

    return narrow >= settings.narrowMinPlayers && narrow * 100 >= settings.narrowPercent * hands.length;
}

export function noValidPredictions(hands, deck, settings) {
    return !hands.some(([first, second]) => deck.some((card) => cardWins(card, first, second, settings)));
}
