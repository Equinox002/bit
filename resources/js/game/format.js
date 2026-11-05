export const SUITS = {
    H: { symbol: '♥︎', name: 'hearts', red: true },
    D: { symbol: '♦︎', name: 'diamonds', red: true },
    C: { symbol: '♣︎', name: 'clubs', red: false },
    S: { symbol: '♠︎', name: 'spades', red: false },
};

const RANK_NAMES = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };

export function parseCard(card) {
    const rank = card.slice(0, -1);
    const suit = SUITS[card.slice(-1)];

    return { rank, suit, label: `${RANK_NAMES[rank] ?? rank} of ${suit.name}` };
}

export function chips(amount) {
    return Number(amount ?? 0).toLocaleString('en-IN');
}

export function multiplierLabel(hundredths) {
    return `${(hundredths / 100).toFixed(hundredths % 10 === 0 ? (hundredths % 100 === 0 ? 0 : 1) : 2)}x`;
}

const RESET_REASONS = {
    pot_zero: 'The pot was emptied',
    deck_empty: 'The deck ran out',
    no_valid_predictions: 'No hand could win with the cards left',
    no_eligible_bettors: 'Nobody could place a bet',
    narrow_range: 'Too many narrow hands',
    max_cycles: 'Every player has had their turn',
    no_bets: 'Nobody bet for a full cycle',
    manual: 'The host reset the round',
};

export function resetReason(reason) {
    return RESET_REASONS[reason] ?? 'Round complete';
}

const FINISH_REASONS = {
    host_ended: 'The host ended the game',
    not_enough_players: 'Too few players could continue',
    pot_empty: 'The pot could not be refilled',
};

export function finishReason(reason) {
    return FINISH_REASONS[reason] ?? 'Game over';
}

/**
 * Plain-language lines for the table's activity log. Unlisted events are not shown.
 */
export function describeEvent(event, nameOf) {
    const { type, data } = event;
    const who = data.playerId ? nameOf(data.playerId) : '';

    switch (type) {
        case 'round:start':
            return `Round ${data.number} dealt. ${nameOf(data.startingPlayerId)} starts.`;
        case 'round:redeal':
            return 'Too many narrow hands, so the cards were dealt again.';
        case 'cycle:start':
            return data.cycle > 1 ? `Betting cycle ${data.cycle} begins with the same cards.` : null;
        case 'game:turn-started':
            return `${who} plays ${data.range}.`;
        case 'bet:place':
            return `${who} bets ${chips(data.amount)}.`;
        case 'bet:skip':
            return `${who} ${data.why === 'timeout' ? 'ran out of time' : data.why === 'disconnected' ? 'is away and passes' : 'skips their own bet'}.`;
        case 'bet:decline':
            return `${who} ${data.why === 'timeout' ? 'ran out of time' : data.why === 'disconnected' ? 'is away and passes' : 'declines'}.`;
        case 'bet:auto-pass':
            return data.why === 'pot_exhausted' ? `${who} can't bet: the pot is fully covered.` : `${who} can't bet this turn.`;
        case 'turn:skipped':
            return `${who} has no winning range, so their turn is skipped.`;
        case 'turn:no-bets':
            return `Nobody bet on ${who}'s cards, so no card was drawn.`;
        case 'hand:replaced':
            return `${who} received a replacement hand.`;
        case 'deck:reshuffled':
            return `Used cards were reshuffled into the deck (${data.cards} cards).`;
        case 'card:revealed':
            return `Drew ${parseCard(data.card).label}: ${data.won ? 'in range' : 'out of range'}.`;
        case 'round:reset':
            return `Round ${data.number} over. ${resetReason(data.reason)}.`;
        case 'room:player-joined':
            return `${who} joined and will play from the next deal.`;
        case 'room:player-left':
            return `${who} left the table.`;
        case 'game:finished':
            return `${finishReason(data.reason)}.`;
        default:
            return null;
    }
}

export function newActionKey() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }

    // randomUUID only exists on HTTPS, and friends on a home network may use plain HTTP.
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
    }

    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();

    return copied;
}
