export const MAX_SEATS = 12;

// name: [default, type, min or allowed values, max]. Mirrors app/Game/GameSettings.php.
const SCHEMA = {
    minPlayers: [2, 'int', 2, MAX_SEATS],
    maxPlayers: [8, 'int', 2, MAX_SEATS],
    allowLateJoin: [false, 'bool'],
    turnTimeout: [30, 'int', 10, 300],
    startingChips: [1000, 'int', 1, 10000000],
    contribution: [10, 'int', 0, 1000000],
    potSeed: [0, 'int', 0, 10000000],
    minBet: [10, 'int', 1, 1000000],
    maxBet: [0, 'int', 0, 10000000],
    multiplier: [200, 'int', 110, 1000],
    allowSelfBet: [true, 'bool'],
    allowOthers: [true, 'bool'],
    allowSkip: [true, 'bool'],
    maxParticipants: [0, 'int', 0, MAX_SEATS],
    bettingOrder: ['clockwise', 'enum', ['clockwise', 'counterclockwise']],
    endOnPotExhausted: [true, 'bool'],
    aceHigh: [false, 'bool'],
    inclusiveBoundaries: [false, 'bool'],
    identicalHandling: ['skip', 'enum', ['skip', 'replace']],
    consecutiveHandling: ['skip', 'enum', ['skip', 'replace']],
    deckEmptyRule: ['reset', 'enum', ['reset', 'reshuffle']],
    cardVisibility: ['open', 'enum', ['open', 'hidden']],
    autoReset: [true, 'bool'],
    narrowMaxGap: [2, 'int', 0, 11],
    narrowMinPlayers: [2, 'int', 1, MAX_SEATS],
    narrowPercent: [51, 'int', 1, 100],
    narrowTiming: ['immediate', 'enum', ['immediate', 'after_cycle']],
    allowManualReset: [true, 'bool'],
    maxCycles: [1, 'int', 0, 100],
    resetOnIdleCycle: [true, 'bool'],
    contributeEveryRound: [true, 'bool'],
    dealerRotation: [true, 'bool'],
    startingPlayer: ['random', 'enum', ['random', 'host', 'first_seat']],
    hostPolicy: ['next_seat', 'enum', ['next_seat', 'longest_member', 'none']],
};

const PRESETS = {
    quick: { maxPlayers: 6, turnTimeout: 20, startingChips: 500, contribution: 20, minBet: 10 },
    classic: {},
    custom: {},
};

export class InvalidSettingsError extends Error {
    constructor(errors) {
        super(Object.values(errors).join(' '));
        this.errors = errors;
    }
}

function parse(value, rule) {
    switch (rule[1]) {
        case 'bool':
            return typeof value === 'boolean' ? value : null;
        case 'enum':
            return rule[2].includes(value) ? value : null;
        default: {
            const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

            return Number.isInteger(number) && number >= rule[2] && number <= rule[3] ? number : null;
        }
    }
}

function describe(name, rule) {
    switch (rule[1]) {
        case 'bool':
            return `${name} must be true or false.`;
        case 'enum':
            return `${name} must be one of: ${rule[2].join(', ')}.`;
        default:
            return `${name} must be a whole number between ${rule[2]} and ${rule[3]}.`;
    }
}

function crossFieldErrors(v) {
    const errors = {};

    if (v.minPlayers > v.maxPlayers) {
        errors.minPlayers = 'Minimum players cannot exceed maximum players.';
    }

    if (v.contribution > v.startingChips) {
        errors.contribution = 'The contribution cannot exceed the starting chips.';
    }

    if (v.contribution + v.potSeed < 1) {
        errors.contribution = 'Set a contribution or a pot seed, or the pot would start empty.';
    }

    if (v.maxBet > 0 && v.minBet > v.maxBet) {
        errors.minBet = 'The minimum bet cannot exceed the maximum bet.';
    }

    if (v.minBet > v.startingChips) {
        errors.minBet = 'The minimum bet cannot exceed the starting chips.';
    }

    if (!v.allowSelfBet && !v.allowOthers) {
        errors.allowOthers = 'Allow self-betting, other players, or both, or nobody could bet.';
    }

    return errors;
}

/**
 * Validated rules as a plain, frozen object, so they can be saved and restored as they are.
 */
export function makeSettings(input = {}) {
    const values = {};
    let errors = {};

    for (const [name, rule] of Object.entries(SCHEMA)) {
        const parsed = parse(input[name] ?? rule[0], rule);

        if (parsed === null) {
            errors[name] = describe(name, rule);
        } else {
            values[name] = parsed;
        }
    }

    if (Object.keys(errors).length === 0) {
        errors = crossFieldErrors(values);
    }

    if (Object.keys(errors).length > 0) {
        throw new InvalidSettingsError(errors);
    }

    return Object.freeze(values);
}

export function presetValues() {
    return Object.fromEntries(Object.entries(PRESETS).map(([name, preset]) => [name, makeSettings(preset)]));
}
