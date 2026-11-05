import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { test } from 'node:test';
import { FINISHED, GameEngine, PLAYING, ROUND_SUMMARY, stateViolations, viewFor } from '../../resources/js/game/engine/engine.js';
import { GameRuleError, secureRandomizer, standardDeck } from '../../resources/js/game/engine/rules.js';
import { InvalidSettingsError, makeSettings, presetValues } from '../../resources/js/game/engine/settings.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/engine-parity.json', import.meta.url)));
const players = (count) => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));
const EXAMPLE = ['AH', '5C', '5S', 'KD', '10H', 'QS'];

function stacked(cards, pick = 1) {
    return {
        shuffle: (deck) => [...cards, ...deck.filter((card) => !cards.includes(card))],
        pick: () => pick,
    };
}

function example(draws = [], overrides = {}) {
    return GameEngine.begin(players(3), makeSettings(overrides), stacked([...EXAMPLE, ...draws]), 1000, 1);
}

function canonical(value) {
    if (Array.isArray(value)) {
        return value.map(canonical);
    }

    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value).sort();

        // An empty PHP array can't say whether it is a list or an object.
        return keys.length === 0 ? [] : Object.fromEntries(keys.map((key) => [key, canonical(value[key])]));
    }

    return value;
}

function checksum(engine, settings, now, rejected) {
    const { state } = engine;

    return crypto.createHash('sha256').update(JSON.stringify(canonical({
        state,
        events: engine.events,
        transactions: engine.transactions,
        view: viewFor(state, settings, state.seats[0], now),
        actor: engine.currentActor(),
        rejected,
    }))).digest('hex');
}

function applyStep(engine, step) {
    try {
        switch (step.action) {
            case 'bet': engine.placeBet(step.player, step.amount); break;
            case 'pass': engine.pass(step.player); break;
            case 'offline': engine.passOffline(step.player); break;
            case 'remove': engine.removePlayer(step.player); break;
            case 'late': engine.addLatePlayer(step.player, step.name); break;
            case 'reset': engine.requestReset(); break;
            case 'continue': engine.continueToNextRound(); break;
            case 'end': engine.endGame(); break;
            case 'tick': engine.tick(); break;
            default: throw new Error(`Unknown step ${step.action}`);
        }
    } catch (error) {
        if (error instanceof GameRuleError) {
            return error.reason;
        }

        throw error;
    }

    return null;
}

test('every recorded PHP game replays identically, step by step', () => {
    let steps = 0;

    fixture.games.forEach((game, index) => {
        const settings = makeSettings(game.config);
        const decks = [...game.decks];
        const picks = [...game.picks];
        const randomizer = { shuffle: () => decks.shift(), pick: () => picks.shift() };
        let engine = GameEngine.begin(game.players, settings, randomizer, game.start, game.players[0].id);

        assert.equal(checksum(engine, settings, game.start, null), game.checksums[0], `Game ${index} differs at the deal.`);

        game.steps.forEach((step, stepIndex) => {
            engine = new GameEngine(engine.state, settings, randomizer, step.now);
            const rejected = applyStep(engine, step);

            assert.equal(
                checksum(engine, settings, step.now, rejected),
                game.checksums[stepIndex + 1],
                `Game ${index} (${JSON.stringify(game.config)}) differs at step ${stepIndex}: ${JSON.stringify(step)}`,
            );
            steps++;
        });
    });

    assert.ok(steps > 500, `Expected a meaningful recording, got ${steps} steps.`);
});

test('presets and defaults match the server', () => {
    assert.deepEqual(canonical(presetValues()), canonical(fixture.presets));
});

test('settings are validated like the server', () => {
    for (const invalid of [
        { minPlayers: 1 },
        { maxPlayers: 40 },
        { multiplier: 100 },
        { minPlayers: 8, maxPlayers: 4 },
        { minBet: 50, maxBet: 10 },
        { contribution: 5000 },
        { contribution: 0 },
        { allowSelfBet: false, allowOthers: false },
        { bettingOrder: 'sideways' },
        { aceHigh: 'yes' },
        { turnTimeout: 'soon' },
        { minBet: '' },
        { minBet: 1.5 },
    ]) {
        assert.throws(() => makeSettings(invalid), InvalidSettingsError, JSON.stringify(invalid));
    }

    assert.equal(makeSettings({ minBet: '25' }).minBet, 25, 'Numbers typed into a form are accepted.');
});

test('the spec winning example pays double from the pot', () => {
    const engine = example(['3D']);

    assert.equal(engine.state.pot, 30);
    engine.placeBet(1, 10);
    assert.equal(engine.limitsFor(2).available, 20);
    engine.placeBet(2, 20);

    assert.equal(engine.state.pot, 0);
    assert.equal(engine.state.players[1].chips, 1000);
    assert.equal(engine.state.players[2].chips, 1010);
    assert.equal(engine.state.lastResult.outcomes[1].payout, 40);
    assert.deepEqual(stateViolations(engine.state), []);
});

test('the spec losing example feeds the pot and moves to player 2', () => {
    let engine = example(['9D']);

    engine.placeBet(1, 10);
    engine.placeBet(2, 20);
    assert.equal(engine.state.pot, 60);

    engine = new GameEngine(engine.state, makeSettings(), stacked([]), engine.state.deadline);
    engine.tick();
    assert.equal(engine.state.turn.activeId, 2);
    assert.equal(engine.state.turn.rangeLabel, '5–K');
});

test('a leftover pot carries into the next round with new contributions', () => {
    for (const [overrides, pot, chips] of [[{}, 70, 980], [{ contributeEveryRound: false }, 40, 990]]) {
        const settings = makeSettings(overrides);
        let engine = GameEngine.begin(players(3), settings, stacked([...EXAMPLE, 'KC']), 1000, 1);

        engine.placeBet(1, 10);
        engine.pass(2);
        engine.pass(3);
        engine.requestReset();
        assert.equal(engine.state.pot, 40);

        engine = new GameEngine(engine.state, settings, stacked([]), engine.state.deadline);
        engine.tick();
        engine.continueToNextRound();

        assert.equal(engine.state.pot, pot);
        assert.equal(engine.state.players[2].chips, chips);
        assert.deepEqual(stateViolations(engine.state), []);
    }
});

test('the next round starts once everyone has had a turn', () => {
    const settings = makeSettings({ potSeed: 70, minBet: 5 });
    const next = (engine) => {
        const later = new GameEngine(engine.state, settings, stacked([]), engine.state.deadline);

        later.tick();

        return later;
    };
    let engine = GameEngine.begin(players(3), settings, stacked(['2H', 'KC', '3S', 'QD', '4C', 'JD', '7D', '8C', '9H']), 1000, 1);

    assert.equal(engine.state.pot, 100);
    engine.placeBet(1, 5);
    engine.placeBet(2, 5);
    engine.placeBet(3, 5);
    engine = next(engine);
    engine.placeBet(2, 10);
    engine.pass(3);
    engine.pass(1);
    engine = next(engine);
    engine.placeBet(3, 15);
    engine.placeBet(1, 15);
    engine.placeBet(2, 5);
    engine = next(engine);

    assert.equal(engine.state.phase, ROUND_SUMMARY);
    assert.equal(engine.state.lastSummary.reason, 'max_cycles');
    assert.equal(engine.state.pot, 40);
    assert.equal(engine.state.players[1].chips, 1010);

    engine = new GameEngine(engine.state, settings, stacked([]), 1000);
    engine.continueToNextRound();
    assert.equal(engine.state.round.number, 2);
    assert.equal(engine.state.pot, 70);
    assert.equal(engine.state.players[1].chips, 1000);
    assert.deepEqual(stateViolations(engine.state), []);
});

test('a full cycle with no bets deals new cards and carries the pot', () => {
    const wide = ['2H', '8C', '3S', '9D', 'AD', '10S'];
    const settings = makeSettings();
    let engine = GameEngine.begin(players(3), settings, stacked(wide), 1000, 1);

    while (engine.state.phase === PLAYING) {
        engine.pass(engine.currentActor());
    }

    assert.equal(engine.state.lastSummary.reason, 'no_bets');
    assert.equal(engine.state.pot, 30);

    engine = new GameEngine(engine.state, settings, stacked([]), 1000);
    engine.continueToNextRound();
    assert.equal(engine.state.round.number, 2);
    assert.equal(engine.state.pot, 60);
    assert.equal(engine.state.players[1].chips, 980);
    assert.deepEqual(stateViolations(engine.state), []);
});

test('a rejected action leaves the saved state untouched', () => {
    const engine = example();
    const before = JSON.stringify(engine.state);
    const next = new GameEngine(engine.state, makeSettings(), stacked([]), 1000);

    assert.throws(() => next.placeBet(1, 999999), (error) => error.reason === 'invalid_amount');
    assert.throws(() => next.placeBet(2, 10), (error) => error.reason === 'not_your_turn');
    assert.equal(JSON.stringify(engine.state), before);
});

test('hidden rooms keep other hands out of the view', () => {
    const settings = makeSettings({ cardVisibility: 'hidden' });
    const engine = GameEngine.begin(players(3), settings, stacked(EXAMPLE), 1000, 1);
    const view = viewFor(engine.state, settings, 2, 1000);

    assert.deepEqual(view.players[0].hand, ['AH', '5C']);
    assert.deepEqual(view.players[1].hand, ['5S', 'KD']);
    assert.equal(view.players[2].hand, null);
    assert.equal(viewFor(engine.state, settings, null, 1000).players[1].hand, null, 'With no viewer, only the active hand shows.');
    assert.equal(view.deck, undefined);
});

test('the secure shuffle keeps every card and looks unbiased', () => {
    const counts = {};

    for (let i = 0; i < 5200; i++) {
        const deck = secureRandomizer.shuffle(standardDeck());

        assert.equal(new Set(deck).size, 52);
        counts[deck[0]] = (counts[deck[0]] ?? 0) + 1;
    }

    // Each card expects 100 appearances, so these bounds are many standard deviations wide.
    assert.equal(Object.keys(counts).length, 52);
    assert.ok(Math.min(...Object.values(counts)) > 40);
    assert.ok(Math.max(...Object.values(counts)) < 180);
});

test('random games never break the accounting', () => {
    const configurations = [{}, { maxCycles: 0 }, { multiplier: 300 }, { multiplier: 150 }, { inclusiveBoundaries: true }, { startingChips: 60, contribution: 20, minBet: 5 }, { allowSelfBet: false }];

    for (const config of configurations) {
        const settings = makeSettings(config);

        for (let game = 0; game < 25; game++) {
            let now = 1000;
            let engine = GameEngine.begin(players(2 + (game % 7)), settings, secureRandomizer, now, 1);

            for (let step = 0; step < 300 && engine.state.phase !== FINISHED; step++) {
                now = Math.max(now + 1, engine.state.deadline ?? 0);
                engine = new GameEngine(engine.state, settings, secureRandomizer, now);
                const actor = engine.currentActor();

                if (engine.state.phase === ROUND_SUMMARY) {
                    engine.continueToNextRound();
                } else if (engine.state.phase === PLAYING && actor === null) {
                    engine.tick();
                } else {
                    const limits = engine.limitsFor(actor);

                    if (limits && Math.random() < 0.7) {
                        engine.placeBet(actor, limits.min + Math.floor(Math.random() * (limits.max - limits.min + 1)));
                    } else {
                        engine.pass(actor);
                    }
                }

                assert.deepEqual(stateViolations(engine.state), []);
            }
        }
    }
});
