<?php

namespace App\Game;

/**
 * The server-authoritative rules of the game. It has no framework or database dependencies: it
 * takes a state array, applies one action, and exposes the new state plus the events and ledger
 * entries that action produced.
 */
final class GameEngine
{
    public const PLAYING = 'playing';

    public const ROUND_SUMMARY = 'round_summary';

    public const FINISHED = 'finished';

    public const MAX_REDEALS = 5;

    public const REVEAL_SECONDS = 5;

    public const SUMMARY_SECONDS = 30;

    private const LOG_SIZE = 40;

    private array $state;

    private Ledger $ledger;

    /** @var list<array{type: string, data: array<string, mixed>}> */
    private array $events = [];

    public function __construct(
        array $state,
        private readonly GameSettings $settings,
        private readonly Randomizer $randomizer,
        private readonly int $now,
    ) {
        $this->state = $state;
        $this->ledger = new Ledger($this->state);
    }

    /**
     * @param  list<array{id: int, name: string}>  $players  In clockwise seating order.
     */
    public static function begin(array $players, GameSettings $settings, Randomizer $randomizer, int $now, ?int $hostId = null): self
    {
        $state = [
            'phase' => self::PLAYING,
            'hostId' => $hostId,
            'seats' => array_column($players, 'id'),
            'players' => [],
            'pot' => 0,
            'escrow' => 0,
            'issued' => 0,
            'deck' => [],
            'discard' => [],
            'round' => null,
            'turn' => null,
            'turnCounter' => 0,
            'pendingReset' => null,
            'lastResult' => null,
            'lastSummary' => null,
            'history' => [],
            'log' => [],
            'deadline' => null,
            'final' => null,
        ];

        foreach ($players as $player) {
            $state['players'][$player['id']] = self::newPlayer($player);
        }

        $engine = new self($state, $settings, $randomizer, $now);

        foreach ($players as $player) {
            $engine->ledger->issue(Ledger::ISSUE, $player['id'], $settings->startingChips);
        }

        if ($settings->potSeed > 0) {
            $engine->ledger->issue(Ledger::SEED, null, $settings->potSeed);
        }

        $engine->emit('game:start', ['players' => count($players)]);
        $engine->startRound();

        return $engine;
    }

    public function state(): array
    {
        return $this->state;
    }

    /**
     * @return list<array{type: string, data: array<string, mixed>}>
     */
    public function events(): array
    {
        return $this->events;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function transactions(): array
    {
        return $this->ledger->entries();
    }

    /**
     * The player the game is currently waiting for, if any.
     */
    public function currentActor(): ?int
    {
        $turn = $this->state['turn'];

        return match ($turn['stage'] ?? null) {
            'own_bet' => $turn['activeId'],
            'invite' => $turn['askedId'],
            default => null,
        };
    }

    /**
     * @return array{min: int, max: int, available: int}|null
     */
    public function limitsFor(int $playerId): ?array
    {
        $player = $this->state['players'][$playerId] ?? null;

        if ($player === null || $player['status'] === 'left') {
            return null;
        }

        return BettingCalculator::limits(
            $this->state['pot'],
            array_column($this->state['turn']['bets'] ?? [], 'amount'),
            $player['chips'],
            $this->settings,
        );
    }

    /**
     * The active player's own bet, or an invited player's "Accept & Bet".
     */
    public function placeBet(int $playerId, int $amount): void
    {
        $this->requireCurrentActor($playerId);
        $limits = $this->limitsFor($playerId);

        if ($limits === null || $amount < $limits['min'] || $amount > $limits['max']) {
            throw new GameRuleException('invalid_amount', $limits === null
                ? 'You cannot bet on this turn.'
                : "Your bet must be between {$limits['min']} and {$limits['max']} chips.");
        }

        $this->ledger->move(Ledger::BET_RESERVE, 'player', 'escrow', $playerId, $amount);
        $this->state['turn']['bets'][] = ['playerId' => $playerId, 'amount' => $amount];
        // Games saved before this counter existed don't have it yet.
        $this->state['round']['cycleBets'] = ($this->state['round']['cycleBets'] ?? 0) + 1;
        $this->emit('bet:place', ['playerId' => $playerId, 'amount' => $amount]);
        $this->continueBetting();
    }

    /**
     * The active player's skip, or an invited player's decline. Nobody is ever forced to bet.
     */
    public function pass(int $playerId, string $why = 'choice'): void
    {
        $this->requireCurrentActor($playerId);
        $turn = &$this->state['turn'];

        if ($turn['stage'] === 'own_bet') {
            $this->emit('bet:skip', ['playerId' => $playerId, 'why' => $why]);

            if (! $this->settings->allowSkip) {
                $turn['queue'] = [];
            }
        } else {
            $turn['declined'][] = $playerId;
            $this->emit('bet:decline', ['playerId' => $playerId, 'why' => $why]);
        }

        unset($turn);
        $this->continueBetting();
    }

    /**
     * Enforce whichever deadline has passed. Safe to call repeatedly: it does nothing early.
     */
    public function tick(): bool
    {
        if ($this->state['deadline'] === null || $this->now < $this->state['deadline']) {
            return false;
        }

        $this->advanceAfterDeadline();

        return true;
    }

    /**
     * Pass on behalf of a player who is no longer connected.
     */
    public function passOffline(int $playerId): bool
    {
        if ($this->currentActor() !== $playerId) {
            return false;
        }

        $this->pass($playerId, 'disconnected');

        return true;
    }

    /**
     * The host's manual reset. A turn with accepted bets finishes first so stakes settle normally.
     */
    public function requestReset(): void
    {
        if (! $this->settings->allowManualReset) {
            throw new GameRuleException('reset_disabled', 'Manual resets are turned off for this room.');
        }

        if ($this->state['phase'] !== self::PLAYING) {
            throw new GameRuleException('wrong_phase', 'There is no round in progress to reset.');
        }

        $this->emit('round:reset-requested', []);
        $turn = $this->state['turn'];

        if ($turn !== null && ($turn['bets'] !== [] || $turn['stage'] === 'reveal')) {
            $this->state['pendingReset'] = 'manual';

            if ($turn['stage'] !== 'reveal') {
                $this->state['turn']['queue'] = [];
                $this->state['turn']['askedId'] = null;
                $this->lockAndDraw();
            }

            return;
        }

        $this->endRound('manual');
    }

    public function continueToNextRound(): void
    {
        if ($this->state['phase'] !== self::ROUND_SUMMARY) {
            throw new GameRuleException('wrong_phase', 'The current round has not finished.');
        }

        $this->startRound();
    }

    /**
     * End the game. Stakes on a turn with no drawn card are refunded, then the pot is split.
     */
    public function endGame(string $reason = 'host_ended'): void
    {
        if ($this->state['phase'] === self::FINISHED) {
            throw new GameRuleException('wrong_phase', 'This game has already finished.');
        }

        $this->finish($reason);
    }

    /**
     * A player joining a game in progress. They pay in now and receive cards at the next deal.
     */
    public function addLatePlayer(int $playerId, string $name): void
    {
        if (! $this->settings->allowLateJoin) {
            throw new GameRuleException('late_join_disabled', 'This game does not allow joining after it starts.');
        }

        if (isset($this->state['players'][$playerId])) {
            throw new GameRuleException('already_joined', 'You have already joined this game.');
        }

        $this->state['players'][$playerId] = [...self::newPlayer(['id' => $playerId, 'name' => $name]), 'status' => 'waiting'];
        $this->state['seats'][] = $playerId;
        $this->ledger->issue(Ledger::ISSUE, $playerId, $this->settings->startingChips);
        $this->ledger->move(Ledger::CONTRIBUTION, 'player', 'pot', $playerId, $this->settings->contribution);
        $this->emit('room:player-joined', ['playerId' => $playerId]);
    }

    public function removePlayer(int $playerId): void
    {
        if (! isset($this->state['players'][$playerId]) || $this->state['players'][$playerId]['status'] === 'left') {
            return;
        }

        $wasCurrentActor = $this->currentActor() === $playerId;
        $this->state['players'][$playerId]['status'] = 'left';
        $this->emit('room:player-left', ['playerId' => $playerId]);

        if ($this->state['phase'] === self::FINISHED) {
            return;
        }

        if (count($this->playersWithStatus(['playing', 'waiting', 'sitting_out'])) < 2) {
            $this->finish('not_enough_players');

            return;
        }

        if ($wasCurrentActor) {
            $this->emit($this->state['turn']['stage'] === 'own_bet' ? 'bet:skip' : 'bet:decline', [
                'playerId' => $playerId,
                'why' => 'left',
            ]);
            $this->continueBetting();
        }
    }

    public function setHost(int $playerId): void
    {
        $this->state['hostId'] = $playerId;
    }

    private static function newPlayer(array $player): array
    {
        return [
            'id' => $player['id'],
            'name' => $player['name'],
            'chips' => 0,
            'status' => 'playing',
            'hand' => null,
            'totalWon' => 0,
            'totalLost' => 0,
        ];
    }

    private function requireCurrentActor(int $playerId): void
    {
        if ($this->state['phase'] !== self::PLAYING || $this->state['turn'] === null) {
            throw new GameRuleException('wrong_phase', 'Betting is not open right now.');
        }

        if ($this->currentActor() !== $playerId) {
            throw new GameRuleException('not_your_turn', 'It is not your turn to act.');
        }
    }

    private function advanceAfterDeadline(): void
    {
        if ($this->state['phase'] === self::ROUND_SUMMARY) {
            $this->startRound();

            return;
        }

        if ($this->state['phase'] !== self::PLAYING || $this->state['turn'] === null) {
            $this->state['deadline'] = null;

            return;
        }

        if ($this->state['turn']['stage'] === 'reveal') {
            $this->state['turn'] = null;
            $this->state['deadline'] = null;
            $this->startNextTurn();

            return;
        }

        $this->pass($this->currentActor(), 'timeout');
    }

    private function startRound(): void
    {
        $previous = $this->state['round'];
        // Whatever is left in the pot always carries over; contributions are added on top of it.
        $needsContribution = $previous === null || $this->state['pot'] <= 0 || $this->settings->contributeEveryRound;
        $contribution = $this->settings->contribution;
        $seated = $this->playersWithStatus(['playing', 'waiting', 'sitting_out']);
        $playing = [];

        foreach ($seated as $id) {
            if (! $needsContribution || $this->state['players'][$id]['chips'] >= $contribution) {
                $playing[] = $id;
            }
        }

        $cost = $needsContribution ? $contribution : 0;
        $withChips = array_filter($playing, fn (int $id) => $this->state['players'][$id]['chips'] - $cost > 0);

        if (count($playing) < $this->settings->minPlayers || count($withChips) < $this->settings->minPlayers) {
            $this->finish('not_enough_players');

            return;
        }

        foreach ($seated as $id) {
            $this->state['players'][$id]['status'] = in_array($id, $playing, true) ? 'playing' : 'sitting_out';
        }

        // Includes players who left, whose old cards go back into the fresh deck.
        foreach (array_keys($this->state['players']) as $id) {
            $this->state['players'][$id]['hand'] = null;
        }

        $number = ($previous['number'] ?? 0) + 1;
        $this->state['round'] = ['number' => $number];

        if ($needsContribution) {
            foreach ($playing as $id) {
                $this->ledger->move(Ledger::CONTRIBUTION, 'player', 'pot', $id, $contribution);
            }
        }

        if ($this->state['pot'] <= 0) {
            $this->finish('pot_empty');

            return;
        }

        $start = $this->chooseStarter($previous['startingPlayerId'] ?? null, $playing);
        $order = SeatOrder::startingFrom($this->state['seats'], $start, $playing);

        $this->state['round'] = [
            'number' => $number,
            'startingPlayerId' => $start,
            'dealerId' => $order[count($order) - 1],
            'order' => $order,
            'turnIndex' => -1,
            'cycle' => 1,
            'startingPot' => $this->state['pot'],
            'redeals' => 0,
            'cardsDrawn' => 0,
            'cycleBets' => 0,
            'winningBets' => 0,
            'losingBets' => 0,
            'results' => array_fill_keys($playing, ['won' => 0, 'lost' => 0]),
        ];
        $this->state['pendingReset'] = null;
        $this->state['phase'] = self::PLAYING;
        $this->state['deadline'] = null;
        $this->state['turn'] = null;
        $this->state['lastResult'] = null;

        $this->deal($order);
        $this->emit('round:start', ['number' => $number, 'startingPlayerId' => $start]);
        $this->emit('cycle:start', ['cycle' => 1]);
        $this->startNextTurn();
    }

    private function chooseStarter(?int $previous, array $playing): int
    {
        if ($previous !== null) {
            if (! $this->settings->dealerRotation && in_array($previous, $playing, true)) {
                return $previous;
            }

            return SeatOrder::nextAfter($this->state['seats'], $previous, $playing) ?? $playing[0];
        }

        return match ($this->settings->startingPlayer) {
            'host' => in_array($this->state['hostId'], $playing, true) ? $this->state['hostId'] : $playing[0],
            'first_seat' => $playing[0],
            default => $this->randomizer->pick($playing),
        };
    }

    /**
     * Shuffle and deal. A deal that is already too narrow is replaced, up to a cap that keeps an
     * unlucky table from looping. No bets exist yet, so a re-deal costs nothing.
     */
    private function deal(array $order): void
    {
        do {
            $this->state['deck'] = Deck::shuffled($this->randomizer);
            $this->state['discard'] = [];

            foreach ($order as $id) {
                $this->state['players'][$id]['hand'] = [
                    array_shift($this->state['deck']),
                    array_shift($this->state['deck']),
                ];
            }

            $redeal = $this->settings->narrowTiming === 'immediate'
                && $this->state['round']['redeals'] < self::MAX_REDEALS
                && ResetPolicy::narrowRangeTriggered($this->activeHands(), $this->settings);

            if ($redeal) {
                $this->state['round']['redeals']++;
                $this->emit('round:redeal', ['reason' => 'narrow_range']);
            }
        } while ($redeal);
    }

    private function startNextTurn(): void
    {
        while ($this->state['phase'] === self::PLAYING) {
            if ($this->state['pendingReset'] !== null) {
                $this->endRound($this->state['pendingReset']);

                return;
            }

            if ($this->state['pot'] <= 0) {
                $this->endRound('pot_zero');

                return;
            }

            if ($this->state['deck'] === [] && ! $this->refillDeck()) {
                $this->endRound('deck_empty');

                return;
            }

            if (ResetPolicy::noValidPredictions($this->activeHands(), $this->state['deck'], $this->settings)) {
                $this->endRound('no_valid_predictions');

                return;
            }

            if (! $this->anyoneCanBet()) {
                $this->endRound('no_eligible_bettors');

                return;
            }

            $activeId = $this->nextActivePlayer();

            if ($activeId === null) {
                return;
            }

            if ($this->resolveHand($activeId)) {
                $this->beginTurn($activeId);

                return;
            }

            $this->emit('turn:skipped', ['playerId' => $activeId, 'why' => 'no_range']);
        }
    }

    /**
     * Next seat in this round's order, moving to a new cycle when everyone has had a turn. The
     * same cards carry over between cycles. Returns null when a cycle limit ended the round.
     */
    private function nextActivePlayer(): ?int
    {
        $round = &$this->state['round'];

        while (true) {
            $round['turnIndex']++;

            if ($round['turnIndex'] >= count($round['order'])) {
                $this->emit('cycle:end', ['cycle' => $round['cycle']]);

                if ($this->settings->narrowTiming === 'after_cycle'
                    && ResetPolicy::narrowRangeTriggered($this->activeHands(), $this->settings)) {
                    unset($round);
                    $this->endRound('narrow_range');

                    return null;
                }

                // With no bets no card is drawn, so without this the same hands would repeat forever.
                if ($this->settings->resetOnIdleCycle && ($round['cycleBets'] ?? 0) === 0) {
                    unset($round);
                    $this->endRound('no_bets');

                    return null;
                }

                if ($this->settings->maxCycles > 0 && $round['cycle'] >= $this->settings->maxCycles) {
                    unset($round);
                    $this->endRound('max_cycles');

                    return null;
                }

                $round['cycle']++;
                $round['cycleBets'] = 0;
                $round['turnIndex'] = 0;
                $this->emit('cycle:start', ['cycle' => $round['cycle']]);
            }

            $candidate = $round['order'][$round['turnIndex']];

            if ($this->state['players'][$candidate]['status'] === 'playing') {
                return $candidate;
            }
        }
    }

    /**
     * Whether this hand can be played, replacing it first if the room rules ask for that.
     */
    private function resolveHand(int $playerId): bool
    {
        [$first, $second] = $this->state['players'][$playerId]['hand'];

        if (CardRange::gap($first, $second, $this->settings) > 0) {
            return true;
        }

        $handling = CardRange::isIdentical($first, $second)
            ? $this->settings->identicalHandling
            : $this->settings->consecutiveHandling;

        // Replacing must leave at least one card to draw.
        if ($handling !== 'replace' || count($this->state['deck']) < 3) {
            return false;
        }

        array_push($this->state['discard'], $first, $second);
        $this->state['players'][$playerId]['hand'] = [
            array_shift($this->state['deck']),
            array_shift($this->state['deck']),
        ];
        $this->emit('hand:replaced', ['playerId' => $playerId]);

        [$first, $second] = $this->state['players'][$playerId]['hand'];

        return CardRange::gap($first, $second, $this->settings) > 0;
    }

    private function refillDeck(): bool
    {
        if ($this->settings->deckEmptyRule !== 'reshuffle' || $this->state['discard'] === []) {
            return false;
        }

        $this->state['deck'] = $this->randomizer->shuffle($this->state['discard']);
        $this->state['discard'] = [];
        $this->emit('deck:reshuffled', ['cards' => count($this->state['deck'])]);

        return true;
    }

    private function beginTurn(int $activeId): void
    {
        [$first, $second] = $this->state['players'][$activeId]['hand'];
        $this->state['turnCounter']++;
        $this->state['turn'] = [
            'number' => $this->state['turnCounter'],
            'activeId' => $activeId,
            'stage' => 'pending',
            'askedId' => null,
            'queue' => $this->inviteQueue($activeId),
            'bets' => [],
            'declined' => [],
            'cards' => [$first, $second],
            'range' => CardRange::winningValues($first, $second, $this->settings),
            'rangeLabel' => CardRange::label($first, $second, $this->settings),
            'gap' => CardRange::gap($first, $second, $this->settings),
            'cycle' => $this->state['round']['cycle'],
        ];
        $this->emit('game:turn-started', ['playerId' => $activeId, 'range' => $this->state['turn']['rangeLabel']]);

        if ($this->settings->allowSelfBet && $this->limitsFor($activeId) !== null) {
            $this->state['turn']['stage'] = 'own_bet';
            $this->state['deadline'] = $this->now + $this->settings->turnTimeout;

            return;
        }

        $this->continueBetting();
    }

    private function inviteQueue(int $activeId): array
    {
        if (! $this->settings->allowOthers) {
            return [];
        }

        $order = array_values(array_filter(
            SeatOrder::clockwiseAfter($this->state['seats'], $activeId),
            fn (int $id) => $id !== $activeId && $this->state['players'][$id]['status'] === 'playing',
        ));

        return $this->settings->bettingOrder === 'counterclockwise' ? array_reverse($order) : $order;
    }

    /**
     * Ask the next eligible player, or lock the bets when no more betting is possible.
     */
    private function continueBetting(): void
    {
        $turn = &$this->state['turn'];
        $turn['askedId'] = null;
        $maxParticipants = $this->settings->maxParticipants;
        $stakes = array_column($turn['bets'], 'amount');
        $available = BettingCalculator::available($this->state['pot'], $stakes, $this->settings->multiplier);

        while ($turn['queue'] !== []) {
            if ($available <= 0) {
                if (! $this->settings->endOnPotExhausted) {
                    foreach ($turn['queue'] as $id) {
                        $this->emit('bet:auto-pass', ['playerId' => $id, 'why' => 'pot_exhausted']);
                    }
                }

                $turn['queue'] = [];
                break;
            }

            if ($maxParticipants > 0 && count($turn['bets']) >= $maxParticipants) {
                $turn['queue'] = [];
                break;
            }

            $next = array_shift($turn['queue']);

            if ($this->state['players'][$next]['status'] !== 'playing' || $this->limitsFor($next) === null) {
                $this->emit('bet:auto-pass', ['playerId' => $next, 'why' => 'cannot_bet']);
                continue;
            }

            $turn['stage'] = 'invite';
            $turn['askedId'] = $next;
            $this->state['deadline'] = $this->now + $this->settings->turnTimeout;
            $this->emit('bet:invite', ['playerId' => $next, 'activeId' => $turn['activeId']]);

            return;
        }

        unset($turn);
        $this->lockAndDraw();
    }

    /**
     * Lock the bets, draw exactly one card and settle. A turn with no bets draws nothing.
     */
    private function lockAndDraw(): void
    {
        $turn = $this->state['turn'];
        $this->state['deadline'] = null;

        if ($turn['bets'] === []) {
            $this->emit('turn:no-bets', ['playerId' => $turn['activeId']]);
            $this->state['turn'] = null;
            $this->startNextTurn();

            return;
        }

        $this->emit('bet:locked', ['total' => array_sum(array_column($turn['bets'], 'amount'))]);

        $drawn = array_shift($this->state['deck']);
        $this->state['discard'][] = $drawn;
        $this->state['round']['cardsDrawn']++;
        $won = CardRange::wins($drawn, $turn['cards'][0], $turn['cards'][1], $this->settings);
        $this->emit('card:revealed', ['card' => $drawn, 'won' => $won]);

        $result = $this->settle($turn, $drawn, $won);

        $this->state['lastResult'] = $result;
        $this->state['turn']['stage'] = 'reveal';
        $this->state['deadline'] = $this->now + self::REVEAL_SECONDS;
        $this->emit('game:result', $result);
    }

    private function settle(array $turn, string $drawn, bool $won): array
    {
        $multiplier = $this->settings->multiplier;
        $potBefore = $this->state['pot'];
        $outcomes = [];

        foreach ($turn['bets'] as $bet) {
            $id = $bet['playerId'];
            $stake = $bet['amount'];
            $profit = 0;

            if ($won) {
                $profit = BettingCalculator::profit($stake, $multiplier);
                $this->ledger->move(Ledger::BET_RETURN, 'escrow', 'player', $id, $stake);
                $this->ledger->move(Ledger::WIN_PROFIT, 'pot', 'player', $id, $profit);
                $this->state['players'][$id]['totalWon'] += $profit;
                $this->state['round']['winningBets'] += $stake;
            } else {
                $this->ledger->move(Ledger::BET_LOSS, 'escrow', 'pot', $id, $stake);
                $this->state['players'][$id]['totalLost'] += $stake;
                $this->state['round']['losingBets'] += $stake;
            }

            $this->state['round']['results'][$id] ??= ['won' => 0, 'lost' => 0];
            $this->state['round']['results'][$id]['won'] += $profit;
            $this->state['round']['results'][$id]['lost'] += $won ? 0 : $stake;

            $outcomes[] = [
                'playerId' => $id,
                'stake' => $stake,
                'profit' => $profit,
                'payout' => $won ? $stake + $profit : 0,
                'won' => $won,
            ];
        }

        return [
            'turnNumber' => $turn['number'],
            'roundNumber' => $this->state['round']['number'],
            'cycle' => $turn['cycle'],
            'activeId' => $turn['activeId'],
            'cards' => $turn['cards'],
            'rangeLabel' => $turn['rangeLabel'],
            'drawn' => $drawn,
            'won' => $won,
            'outcomes' => $outcomes,
            'potBefore' => $potBefore,
            'potAfter' => $this->state['pot'],
        ];
    }

    private function endRound(string $reason): void
    {
        $round = $this->state['round'];
        $summary = [
            'number' => $round['number'],
            'reason' => $reason,
            'startingPot' => $round['startingPot'],
            'endingPot' => $this->state['pot'],
            'winningBets' => $round['winningBets'],
            'losingBets' => $round['losingBets'],
            'cardsDrawn' => $round['cardsDrawn'],
            'cycles' => $round['cycle'],
            'redeals' => $round['redeals'],
            'players' => array_map(fn (int $id) => [
                'playerId' => $id,
                'won' => $round['results'][$id]['won'] ?? 0,
                'lost' => $round['results'][$id]['lost'] ?? 0,
                'chips' => $this->state['players'][$id]['chips'],
            ], $round['order']),
        ];

        $this->state['lastSummary'] = $summary;
        $this->state['history'] = array_slice([...$this->state['history'], $summary], -20);
        $this->state['turn'] = null;
        $this->state['pendingReset'] = null;
        $this->state['phase'] = self::ROUND_SUMMARY;
        $this->state['deadline'] = $this->now + self::SUMMARY_SECONDS;
        $this->emit('round:reset', ['number' => $round['number'], 'reason' => $reason]);
    }

    private function finish(string $reason): void
    {
        foreach ($this->state['turn']['bets'] ?? [] as $bet) {
            if ($this->state['turn']['stage'] !== 'reveal') {
                $this->ledger->move(Ledger::REFUND, 'escrow', 'player', $bet['playerId'], $bet['amount']);
            }
        }

        $seated = $this->playersWithStatus(['playing', 'waiting', 'sitting_out']);
        $share = $seated === [] ? 0 : intdiv($this->state['pot'], count($seated));

        foreach ($seated as $id) {
            $this->ledger->move(Ledger::FINAL_SPLIT, 'pot', 'player', $id, $share);
        }

        $standings = array_values(array_map(fn (array $player) => [
            'playerId' => $player['id'],
            'name' => $player['name'],
            'chips' => $player['chips'],
            'totalWon' => $player['totalWon'],
            'totalLost' => $player['totalLost'],
            'net' => $player['totalWon'] - $player['totalLost'],
        ], $this->state['players']));
        usort($standings, fn (array $a, array $b) => $b['chips'] <=> $a['chips']);

        $this->state['final'] = ['reason' => $reason, 'share' => $share, 'standings' => $standings];
        $this->state['phase'] = self::FINISHED;
        $this->state['turn'] = null;
        $this->state['deadline'] = null;
        $this->emit('game:finished', ['reason' => $reason]);
    }

    /**
     * Whether any future turn this round could receive a bet. Without this check a table where
     * nobody can bet would pass from one empty turn to the next forever.
     */
    private function anyoneCanBet(): bool
    {
        $playing = $this->playersWithStatus(['playing']);
        $hasRange = function (int $id): bool {
            [$first, $second] = $this->state['players'][$id]['hand'];

            return CardRange::gap($first, $second, $this->settings) > 0;
        };

        foreach ($playing as $id) {
            if (BettingCalculator::limits($this->state['pot'], [], $this->state['players'][$id]['chips'], $this->settings) === null) {
                continue;
            }

            if ($this->settings->allowSelfBet && $hasRange($id)) {
                return true;
            }

            if ($this->settings->allowOthers) {
                foreach ($playing as $other) {
                    if ($other !== $id && $hasRange($other)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * @return list<array{0: string, 1: string}>
     */
    private function activeHands(): array
    {
        $hands = [];

        foreach ($this->playersWithStatus(['playing']) as $id) {
            if ($this->state['players'][$id]['hand'] !== null) {
                $hands[] = $this->state['players'][$id]['hand'];
            }
        }

        return $hands;
    }

    /**
     * @param  list<string>  $statuses
     * @return list<int> Player ids in seating order.
     */
    private function playersWithStatus(array $statuses): array
    {
        return array_values(array_filter(
            $this->state['seats'],
            fn (int $id) => in_array($this->state['players'][$id]['status'], $statuses, true),
        ));
    }

    private function emit(string $type, array $data): void
    {
        $this->events[] = ['type' => $type, 'data' => $data];
        $this->state['log'] = array_slice([
            ...$this->state['log'],
            ['type' => $type, 'data' => $data, 'at' => $this->now],
        ], -self::LOG_SIZE);
    }
}
