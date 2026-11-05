import {
    GameRuleError,
    availableStake,
    betLimits,
    betProfit,
    cardWins,
    clockwiseAfter,
    narrowRangeTriggered,
    nextAfter,
    noValidPredictions,
    rangeGap,
    rangeLabel,
    standardDeck,
    startingFrom,
    winningValues,
} from './rules.js';

export const PLAYING = 'playing';
export const ROUND_SUMMARY = 'round_summary';
export const FINISHED = 'finished';
export const MAX_REDEALS = 5;
export const REVEAL_SECONDS = 5;
export const SUMMARY_SECONDS = 30;

const LOG_SIZE = 40;

function newPlayer({ id, name }) {
    return { id, name, chips: 0, status: 'playing', hand: null, totalWon: 0, totalLost: 0 };
}

/**
 * The same state machine as app/Game/GameEngine.php: it takes a state, applies one action, and
 * exposes the new state plus the events and ledger entries that action produced.
 */
export class GameEngine {
    constructor(state, settings, randomizer, now) {
        // A copy, so a rejected action can never leave a half-changed game behind.
        this.state = structuredClone(state);
        this.settings = settings;
        this.randomizer = randomizer;
        this.now = now;
        this.events = [];
        this.transactions = [];
    }

    static begin(players, settings, randomizer, now, hostId = null) {
        const engine = new GameEngine({
            phase: PLAYING,
            hostId,
            seats: players.map((player) => player.id),
            players: Object.fromEntries(players.map((player) => [player.id, newPlayer(player)])),
            pot: 0,
            escrow: 0,
            issued: 0,
            deck: [],
            discard: [],
            round: null,
            turn: null,
            turnCounter: 0,
            pendingReset: null,
            lastResult: null,
            lastSummary: null,
            history: [],
            log: [],
            deadline: null,
            final: null,
        }, settings, randomizer, now);

        players.forEach((player) => engine.issue('chips_issued', player.id, settings.startingChips));

        if (settings.potSeed > 0) {
            engine.issue('pot_seed', null, settings.potSeed);
        }

        engine.emit('game:start', { players: players.length });
        engine.startRound();

        return engine;
    }

    currentActor() {
        const { turn } = this.state;

        if (turn?.stage === 'own_bet') {
            return turn.activeId;
        }

        return turn?.stage === 'invite' ? turn.askedId : null;
    }

    limitsFor(playerId) {
        const player = this.state.players[playerId];

        if (!player || player.status === 'left') {
            return null;
        }

        return betLimits(this.state.pot, (this.state.turn?.bets ?? []).map((bet) => bet.amount), player.chips, this.settings);
    }

    placeBet(playerId, amount) {
        this.requireCurrentActor(playerId);
        const limits = this.limitsFor(playerId);

        if (limits === null || amount < limits.min || amount > limits.max) {
            throw new GameRuleError('invalid_amount', limits === null
                ? 'You cannot bet on this turn.'
                : `Your bet must be between ${limits.min} and ${limits.max} chips.`);
        }

        this.move('bet_reserve', 'player', 'escrow', playerId, amount);
        this.state.turn.bets.push({ playerId, amount });
        // Games saved before this counter existed don't have it yet.
        this.state.round.cycleBets = (this.state.round.cycleBets ?? 0) + 1;
        this.emit('bet:place', { playerId, amount });
        this.continueBetting();
    }

    pass(playerId, why = 'choice') {
        this.requireCurrentActor(playerId);
        const { turn } = this.state;

        if (turn.stage === 'own_bet') {
            this.emit('bet:skip', { playerId, why });

            if (!this.settings.allowSkip) {
                turn.queue = [];
            }
        } else {
            turn.declined.push(playerId);
            this.emit('bet:decline', { playerId, why });
        }

        this.continueBetting();
    }

    tick() {
        if (this.state.deadline === null || this.now < this.state.deadline) {
            return false;
        }

        this.advanceAfterDeadline();

        return true;
    }

    passOffline(playerId) {
        if (this.currentActor() !== playerId) {
            return false;
        }

        this.pass(playerId, 'disconnected');

        return true;
    }

    requestReset() {
        if (!this.settings.allowManualReset) {
            throw new GameRuleError('reset_disabled', 'Manual resets are turned off for this room.');
        }

        if (this.state.phase !== PLAYING) {
            throw new GameRuleError('wrong_phase', 'There is no round in progress to reset.');
        }

        this.emit('round:reset-requested', {});
        const { turn } = this.state;

        if (turn !== null && (turn.bets.length > 0 || turn.stage === 'reveal')) {
            this.state.pendingReset = 'manual';

            if (turn.stage !== 'reveal') {
                turn.queue = [];
                turn.askedId = null;
                this.lockAndDraw();
            }

            return;
        }

        this.endRound('manual');
    }

    continueToNextRound() {
        if (this.state.phase !== ROUND_SUMMARY) {
            throw new GameRuleError('wrong_phase', 'The current round has not finished.');
        }

        this.startRound();
    }

    endGame(reason = 'host_ended') {
        if (this.state.phase === FINISHED) {
            throw new GameRuleError('wrong_phase', 'This game has already finished.');
        }

        this.finish(reason);
    }

    addLatePlayer(playerId, name) {
        if (!this.settings.allowLateJoin) {
            throw new GameRuleError('late_join_disabled', 'This game does not allow joining after it starts.');
        }

        if (this.state.players[playerId]) {
            throw new GameRuleError('already_joined', 'You have already joined this game.');
        }

        this.state.players[playerId] = { ...newPlayer({ id: playerId, name }), status: 'waiting' };
        this.state.seats.push(playerId);
        this.issue('chips_issued', playerId, this.settings.startingChips);
        this.move('contribution', 'player', 'pot', playerId, this.settings.contribution);
        this.emit('room:player-joined', { playerId });
    }

    removePlayer(playerId) {
        const player = this.state.players[playerId];

        if (!player || player.status === 'left') {
            return;
        }

        const wasCurrentActor = this.currentActor() === playerId;
        player.status = 'left';
        this.emit('room:player-left', { playerId });

        if (this.state.phase === FINISHED) {
            return;
        }

        if (this.playersWithStatus(['playing', 'waiting', 'sitting_out']).length < 2) {
            this.finish('not_enough_players');

            return;
        }

        if (wasCurrentActor) {
            this.emit(this.state.turn.stage === 'own_bet' ? 'bet:skip' : 'bet:decline', { playerId, why: 'left' });
            this.continueBetting();
        }
    }

    requireCurrentActor(playerId) {
        if (this.state.phase !== PLAYING || this.state.turn === null) {
            throw new GameRuleError('wrong_phase', 'Betting is not open right now.');
        }

        if (this.currentActor() !== playerId) {
            throw new GameRuleError('not_your_turn', 'It is not your turn to act.');
        }
    }

    advanceAfterDeadline() {
        if (this.state.phase === ROUND_SUMMARY) {
            this.startRound();

            return;
        }

        if (this.state.phase !== PLAYING || this.state.turn === null) {
            this.state.deadline = null;

            return;
        }

        if (this.state.turn.stage === 'reveal') {
            this.state.turn = null;
            this.state.deadline = null;
            this.startNextTurn();

            return;
        }

        this.pass(this.currentActor(), 'timeout');
    }

    startRound() {
        const previous = this.state.round;
        // Whatever is left in the pot always carries over; contributions are added on top of it.
        const needsContribution = previous === null || this.state.pot <= 0 || this.settings.contributeEveryRound;
        const { contribution, minPlayers } = this.settings;
        const seated = this.playersWithStatus(['playing', 'waiting', 'sitting_out']);
        const playing = seated.filter((id) => !needsContribution || this.state.players[id].chips >= contribution);
        const cost = needsContribution ? contribution : 0;
        const withChips = playing.filter((id) => this.state.players[id].chips - cost > 0);

        if (playing.length < minPlayers || withChips.length < minPlayers) {
            this.finish('not_enough_players');

            return;
        }

        seated.forEach((id) => {
            this.state.players[id].status = playing.includes(id) ? 'playing' : 'sitting_out';
        });

        // Includes players who left, whose old cards go back into the fresh deck.
        Object.values(this.state.players).forEach((player) => {
            player.hand = null;
        });

        const number = (previous?.number ?? 0) + 1;
        this.state.round = { number };

        if (needsContribution) {
            playing.forEach((id) => this.move('contribution', 'player', 'pot', id, contribution));
        }

        if (this.state.pot <= 0) {
            this.finish('pot_empty');

            return;
        }

        const start = this.chooseStarter(previous?.startingPlayerId ?? null, playing);
        const order = startingFrom(this.state.seats, start, playing);

        this.state.round = {
            number,
            startingPlayerId: start,
            dealerId: order[order.length - 1],
            order,
            turnIndex: -1,
            cycle: 1,
            startingPot: this.state.pot,
            redeals: 0,
            cardsDrawn: 0,
            cycleBets: 0,
            winningBets: 0,
            losingBets: 0,
            results: Object.fromEntries(playing.map((id) => [id, { won: 0, lost: 0 }])),
        };
        this.state.pendingReset = null;
        this.state.phase = PLAYING;
        this.state.deadline = null;
        this.state.turn = null;
        this.state.lastResult = null;

        this.deal(order);
        this.emit('round:start', { number, startingPlayerId: start });
        this.emit('cycle:start', { cycle: 1 });
        this.startNextTurn();
    }

    chooseStarter(previous, playing) {
        if (previous !== null) {
            if (!this.settings.dealerRotation && playing.includes(previous)) {
                return previous;
            }

            return nextAfter(this.state.seats, previous, playing) ?? playing[0];
        }

        switch (this.settings.startingPlayer) {
            case 'host':
                return playing.includes(this.state.hostId) ? this.state.hostId : playing[0];
            case 'first_seat':
                return playing[0];
            default:
                return this.randomizer.pick(playing);
        }
    }

    deal(order) {
        let redeal;

        do {
            this.state.deck = this.randomizer.shuffle(standardDeck());
            this.state.discard = [];

            order.forEach((id) => {
                this.state.players[id].hand = [this.state.deck.shift(), this.state.deck.shift()];
            });

            redeal = this.settings.narrowTiming === 'immediate'
                && this.state.round.redeals < MAX_REDEALS
                && narrowRangeTriggered(this.activeHands(), this.settings);

            if (redeal) {
                this.state.round.redeals++;
                this.emit('round:redeal', { reason: 'narrow_range' });
            }
        } while (redeal);
    }

    startNextTurn() {
        while (this.state.phase === PLAYING) {
            if (this.state.pendingReset !== null) {
                this.endRound(this.state.pendingReset);

                return;
            }

            if (this.state.pot <= 0) {
                this.endRound('pot_zero');

                return;
            }

            if (this.state.deck.length === 0 && !this.refillDeck()) {
                this.endRound('deck_empty');

                return;
            }

            if (noValidPredictions(this.activeHands(), this.state.deck, this.settings)) {
                this.endRound('no_valid_predictions');

                return;
            }

            if (!this.anyoneCanBet()) {
                this.endRound('no_eligible_bettors');

                return;
            }

            const activeId = this.nextActivePlayer();

            if (activeId === null) {
                return;
            }

            if (this.resolveHand(activeId)) {
                this.beginTurn(activeId);

                return;
            }

            this.emit('turn:skipped', { playerId: activeId, why: 'no_range' });
        }
    }

    nextActivePlayer() {
        const { round } = this.state;

        while (true) {
            round.turnIndex++;

            if (round.turnIndex >= round.order.length) {
                this.emit('cycle:end', { cycle: round.cycle });

                if (this.settings.narrowTiming === 'after_cycle' && narrowRangeTriggered(this.activeHands(), this.settings)) {
                    this.endRound('narrow_range');

                    return null;
                }

                // With no bets no card is drawn, so without this the same hands would repeat forever.
                if (this.settings.resetOnIdleCycle && (round.cycleBets ?? 0) === 0) {
                    this.endRound('no_bets');

                    return null;
                }

                if (this.settings.maxCycles > 0 && round.cycle >= this.settings.maxCycles) {
                    this.endRound('max_cycles');

                    return null;
                }

                round.cycle++;
                round.cycleBets = 0;
                round.turnIndex = 0;
                this.emit('cycle:start', { cycle: round.cycle });
            }

            const candidate = round.order[round.turnIndex];

            if (this.state.players[candidate].status === 'playing') {
                return candidate;
            }
        }
    }

    resolveHand(playerId) {
        const player = this.state.players[playerId];
        const [first, second] = player.hand;

        if (rangeGap(first, second, this.settings) > 0) {
            return true;
        }

        const handling = first.slice(0, -1) === second.slice(0, -1)
            ? this.settings.identicalHandling
            : this.settings.consecutiveHandling;

        // Replacing must leave at least one card to draw.
        if (handling !== 'replace' || this.state.deck.length < 3) {
            return false;
        }

        this.state.discard.push(first, second);
        player.hand = [this.state.deck.shift(), this.state.deck.shift()];
        this.emit('hand:replaced', { playerId });

        return rangeGap(player.hand[0], player.hand[1], this.settings) > 0;
    }

    refillDeck() {
        if (this.settings.deckEmptyRule !== 'reshuffle' || this.state.discard.length === 0) {
            return false;
        }

        this.state.deck = this.randomizer.shuffle(this.state.discard);
        this.state.discard = [];
        this.emit('deck:reshuffled', { cards: this.state.deck.length });

        return true;
    }

    beginTurn(activeId) {
        const [first, second] = this.state.players[activeId].hand;
        this.state.turnCounter++;
        this.state.turn = {
            number: this.state.turnCounter,
            activeId,
            stage: 'pending',
            askedId: null,
            queue: this.inviteQueue(activeId),
            bets: [],
            declined: [],
            cards: [first, second],
            range: winningValues(first, second, this.settings),
            rangeLabel: rangeLabel(first, second, this.settings),
            gap: rangeGap(first, second, this.settings),
            cycle: this.state.round.cycle,
        };
        this.emit('game:turn-started', { playerId: activeId, range: this.state.turn.rangeLabel });

        if (this.settings.allowSelfBet && this.limitsFor(activeId) !== null) {
            this.state.turn.stage = 'own_bet';
            this.state.deadline = this.now + this.settings.turnTimeout;

            return;
        }

        this.continueBetting();
    }

    inviteQueue(activeId) {
        if (!this.settings.allowOthers) {
            return [];
        }

        const order = clockwiseAfter(this.state.seats, activeId)
            .filter((id) => id !== activeId && this.state.players[id].status === 'playing');

        return this.settings.bettingOrder === 'counterclockwise' ? order.reverse() : order;
    }

    continueBetting() {
        const { turn } = this.state;
        turn.askedId = null;
        const { maxParticipants } = this.settings;
        const available = availableStake(this.state.pot, turn.bets.map((bet) => bet.amount), this.settings.multiplier);

        while (turn.queue.length > 0) {
            if (available <= 0) {
                if (!this.settings.endOnPotExhausted) {
                    turn.queue.forEach((playerId) => this.emit('bet:auto-pass', { playerId, why: 'pot_exhausted' }));
                }

                turn.queue = [];
                break;
            }

            if (maxParticipants > 0 && turn.bets.length >= maxParticipants) {
                turn.queue = [];
                break;
            }

            const next = turn.queue.shift();

            if (this.state.players[next].status !== 'playing' || this.limitsFor(next) === null) {
                this.emit('bet:auto-pass', { playerId: next, why: 'cannot_bet' });
                continue;
            }

            turn.stage = 'invite';
            turn.askedId = next;
            this.state.deadline = this.now + this.settings.turnTimeout;
            this.emit('bet:invite', { playerId: next, activeId: turn.activeId });

            return;
        }

        this.lockAndDraw();
    }

    lockAndDraw() {
        const { turn } = this.state;
        this.state.deadline = null;

        if (turn.bets.length === 0) {
            this.emit('turn:no-bets', { playerId: turn.activeId });
            this.state.turn = null;
            this.startNextTurn();

            return;
        }

        this.emit('bet:locked', { total: turn.bets.reduce((sum, bet) => sum + bet.amount, 0) });

        const drawn = this.state.deck.shift();
        this.state.discard.push(drawn);
        this.state.round.cardsDrawn++;
        const won = cardWins(drawn, turn.cards[0], turn.cards[1], this.settings);
        this.emit('card:revealed', { card: drawn, won });

        const result = this.settle(turn, drawn, won);

        this.state.lastResult = result;
        turn.stage = 'reveal';
        this.state.deadline = this.now + REVEAL_SECONDS;
        this.emit('game:result', result);
    }

    settle(turn, drawn, won) {
        const { round, players } = this.state;
        const potBefore = this.state.pot;

        const outcomes = turn.bets.map(({ playerId: id, amount: stake }) => {
            let profit = 0;

            if (won) {
                profit = betProfit(stake, this.settings.multiplier);
                this.move('bet_return', 'escrow', 'player', id, stake);
                this.move('win_profit', 'pot', 'player', id, profit);
                players[id].totalWon += profit;
                round.winningBets += stake;
            } else {
                this.move('bet_loss', 'escrow', 'pot', id, stake);
                players[id].totalLost += stake;
                round.losingBets += stake;
            }

            round.results[id] ??= { won: 0, lost: 0 };
            round.results[id].won += profit;
            round.results[id].lost += won ? 0 : stake;

            return { playerId: id, stake, profit, payout: won ? stake + profit : 0, won };
        });

        return {
            turnNumber: turn.number,
            roundNumber: round.number,
            cycle: turn.cycle,
            activeId: turn.activeId,
            cards: turn.cards,
            rangeLabel: turn.rangeLabel,
            drawn,
            won,
            outcomes,
            potBefore,
            potAfter: this.state.pot,
        };
    }

    endRound(reason) {
        const { round } = this.state;
        const summary = {
            number: round.number,
            reason,
            startingPot: round.startingPot,
            endingPot: this.state.pot,
            winningBets: round.winningBets,
            losingBets: round.losingBets,
            cardsDrawn: round.cardsDrawn,
            cycles: round.cycle,
            redeals: round.redeals,
            players: round.order.map((id) => ({
                playerId: id,
                won: round.results[id]?.won ?? 0,
                lost: round.results[id]?.lost ?? 0,
                chips: this.state.players[id].chips,
            })),
        };

        this.state.lastSummary = summary;
        this.state.history = [...this.state.history, summary].slice(-20);
        this.state.turn = null;
        this.state.pendingReset = null;
        this.state.phase = ROUND_SUMMARY;
        this.state.deadline = this.now + SUMMARY_SECONDS;
        this.emit('round:reset', { number: round.number, reason });
    }

    finish(reason) {
        const { turn } = this.state;

        if (turn && turn.stage !== 'reveal') {
            turn.bets.forEach((bet) => this.move('bet_refund', 'escrow', 'player', bet.playerId, bet.amount));
        }

        const seated = this.playersWithStatus(['playing', 'waiting', 'sitting_out']);
        const share = seated.length === 0 ? 0 : Math.floor(this.state.pot / seated.length);

        seated.forEach((id) => this.move('final_split', 'pot', 'player', id, share));

        const standings = Object.values(this.state.players).map((player) => ({
            playerId: player.id,
            name: player.name,
            chips: player.chips,
            totalWon: player.totalWon,
            totalLost: player.totalLost,
            net: player.totalWon - player.totalLost,
        }));
        standings.sort((a, b) => b.chips - a.chips);

        this.state.final = { reason, share, standings };
        this.state.phase = FINISHED;
        this.state.turn = null;
        this.state.deadline = null;
        this.emit('game:finished', { reason });
    }

    anyoneCanBet() {
        const playing = this.playersWithStatus(['playing']);
        const hasRange = (id) => {
            const [first, second] = this.state.players[id].hand;

            return rangeGap(first, second, this.settings) > 0;
        };

        return playing.some((id) => {
            if (betLimits(this.state.pot, [], this.state.players[id].chips, this.settings) === null) {
                return false;
            }

            return (this.settings.allowSelfBet && hasRange(id))
                || (this.settings.allowOthers && playing.some((other) => other !== id && hasRange(other)));
        });
    }

    activeHands() {
        return this.playersWithStatus(['playing'])
            .map((id) => this.state.players[id].hand)
            .filter((hand) => hand !== null);
    }

    playersWithStatus(statuses) {
        return this.state.seats.filter((id) => statuses.includes(this.state.players[id].status));
    }

    emit(type, data) {
        this.events.push({ type, data });
        this.state.log = [...this.state.log, { type, data, at: this.now }].slice(-LOG_SIZE);
    }

    issue(type, playerId, amount) {
        this.state.issued += amount;
        this.change(type, playerId === null ? 'pot' : 'player', playerId, amount);
    }

    move(type, from, to, playerId, amount) {
        if (amount === 0) {
            return;
        }

        this.change(type, from, from === 'player' ? playerId : null, -amount, playerId);
        this.change(type, to, to === 'player' ? playerId : null, amount, playerId);
    }

    change(type, account, accountOwner, amount, onBehalfOf = null) {
        const previous = account === 'player' ? this.state.players[accountOwner].chips : this.state[account];
        const next = previous + amount;

        if (next < 0) {
            throw new Error(`Ledger refused to take the ${account} balance below zero.`);
        }

        if (account === 'player') {
            this.state.players[accountOwner].chips = next;
        } else {
            this.state[account] = next;
        }

        this.transactions.push({
            type,
            account,
            playerId: accountOwner ?? onBehalfOf,
            amount,
            previous,
            new: next,
            roundNumber: this.state.round?.number ?? 0,
            turnNumber: this.state.turn?.number ?? null,
        });
    }
}

/**
 * Invariants that must hold after every action; mirrors app/Game/StateValidator.php.
 */
export function stateViolations(state) {
    const problems = [];
    const cards = [...state.deck, ...state.discard];
    let playerChips = 0;

    Object.values(state.players).forEach((player) => {
        playerChips += player.chips;

        if (player.chips < 0) {
            problems.push(`Player ${player.id} has negative chips.`);
        }

        if (player.hand !== null) {
            cards.push(...player.hand);
        }
    });

    if (state.pot < 0) {
        problems.push('The pot is negative.');
    }

    if (state.escrow < 0) {
        problems.push('Escrow is negative.');
    }

    if (playerChips + state.pot + state.escrow !== state.issued) {
        problems.push('Chips in play do not match chips issued.');
    }

    const unsettled = (state.turn?.stage ?? 'reveal') !== 'reveal'
        ? state.turn.bets.reduce((sum, bet) => sum + bet.amount, 0)
        : 0;

    if (state.escrow !== unsettled) {
        problems.push('Escrow does not match the unsettled bets.');
    }

    if (cards.length !== new Set(cards).size) {
        problems.push('A card appears more than once.');
    }

    return problems;
}

/**
 * The part of the state one player may see; mirrors app/Game/StateView.php.
 */
export function viewFor(state, settings, viewerId, now) {
    const engine = new GameEngine(state, settings, null, now);
    const { turn } = state;
    const actor = engine.currentActor();
    const stakes = (turn?.bets ?? []).map((bet) => bet.amount);
    const handVisible = (id) => settings.cardVisibility === 'open'
        || id === viewerId
        || turn?.activeId === id
        || state.phase !== PLAYING;

    return {
        phase: state.phase,
        pot: state.pot,
        committed: stakes.reduce((sum, stake) => sum + stake, 0),
        available: availableStake(state.pot, stakes, settings.multiplier),
        deckCount: state.deck.length,
        players: state.seats.map((id) => {
            const player = state.players[id];

            return {
                id,
                name: player.name,
                chips: player.chips,
                status: player.status,
                hand: handVisible(id) ? player.hand : null,
                hasHand: player.hand !== null,
                totalWon: player.totalWon,
                totalLost: player.totalLost,
                net: player.totalWon - player.totalLost,
                bet: (turn?.bets ?? []).filter((bet) => bet.playerId === id).at(-1)?.amount ?? 0,
            };
        }),
        round: state.round === null ? null : {
            number: state.round.number,
            cycle: state.round.cycle ?? 1,
            dealerId: state.round.dealerId ?? null,
            startingPlayerId: state.round.startingPlayerId ?? null,
            cardsDrawn: state.round.cardsDrawn ?? 0,
        },
        turn: turn === null ? null : {
            number: turn.number,
            activeId: turn.activeId,
            stage: turn.stage,
            askedId: turn.askedId,
            queue: turn.queue,
            bets: turn.bets,
            declined: turn.declined,
            cards: turn.cards,
            rangeLabel: turn.rangeLabel,
            gap: turn.gap,
        },
        pendingReset: state.pendingReset,
        lastResult: state.lastResult,
        lastSummary: state.lastSummary,
        history: state.history,
        log: state.log,
        final: state.final,
        deadline: state.deadline,
        serverTime: now,
        you: {
            mustAct: viewerId !== null && actor === viewerId,
            limits: viewerId !== null && actor === viewerId ? engine.limitsFor(viewerId) : null,
        },
    };
}
