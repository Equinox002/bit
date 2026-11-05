<?php

namespace Tests\Support;

use App\Game\GameEngine;
use App\Game\GameRuleException;
use App\Game\GameSettings;
use App\Game\Randomizer;
use App\Game\SecureRandomizer;
use App\Game\StateView;

/**
 * Records real games of the PHP engine as data, so the JavaScript engine used by offline
 * pass-and-play can replay the same cards and actions and must reach the same state every step.
 */
final class EngineParity
{
    public const FIXTURE = __DIR__.'/../fixtures/engine-parity.json';

    private const CONFIGURATIONS = [
        [],
        ['multiplier' => 300],
        ['multiplier' => 150],
        ['maxBet' => 50, 'minBet' => 5],
        ['inclusiveBoundaries' => true],
        ['aceHigh' => true, 'allowSkip' => false],
        ['allowSelfBet' => false, 'bettingOrder' => 'counterclockwise'],
        ['maxCycles' => 2, 'dealerRotation' => false],
        ['startingChips' => 60, 'contribution' => 20, 'minBet' => 5],
        ['deckEmptyRule' => 'reshuffle', 'narrowTiming' => 'after_cycle'],
        ['consecutiveHandling' => 'replace', 'identicalHandling' => 'replace', 'potSeed' => 25],
        ['endOnPotExhausted' => false, 'maxParticipants' => 2],
        ['allowLateJoin' => true, 'startingPlayer' => 'host', 'allowManualReset' => false],
        ['cardVisibility' => 'hidden', 'startingPlayer' => 'first_seat', 'maxCycles' => 1],
        ['resetOnIdleCycle' => false, 'maxCycles' => 0],
        ['contributeEveryRound' => false],
        ['maxCycles' => 0],
    ];

    /**
     * @return array<string, mixed>
     */
    public static function generate(int $gamesPerConfiguration = 2, int $maxSteps = 120): array
    {
        $games = [];

        foreach (self::CONFIGURATIONS as $config) {
            for ($i = 0; $i < $gamesPerConfiguration; $i++) {
                $games[] = self::record($config, random_int(2, 8), $maxSteps);
            }
        }

        return ['presets' => GameSettings::presetValues(), 'games' => $games];
    }

    /**
     * @return list<string> A checksum of everything observable after each step.
     */
    public static function replay(array $game): array
    {
        $settings = GameSettings::fromArray($game['config']);
        $randomizer = new ReplayRandomizer($game['decks'], $game['picks']);
        $engine = GameEngine::begin($game['players'], $settings, $randomizer, $game['start'], $game['players'][0]['id']);
        $checksums = [self::checksum($engine, $settings, $game['start'], null)];

        foreach ($game['steps'] as $step) {
            $engine = new GameEngine($engine->state(), $settings, $randomizer, $step['now']);
            $checksums[] = self::checksum($engine, $settings, $step['now'], self::apply($engine, $step));
        }

        return $checksums;
    }

    private static function record(array $config, int $playerCount, int $maxSteps): array
    {
        $settings = GameSettings::fromArray($config);
        $players = array_map(fn (int $id) => ['id' => $id, 'name' => "P{$id}"], range(1, $playerCount));
        $randomizer = new class(new SecureRandomizer()) implements Randomizer {
            public array $decks = [];

            public array $picks = [];

            public function __construct(private readonly SecureRandomizer $inner)
            {
            }

            public function shuffle(array $cards): array
            {
                return $this->decks[] = $this->inner->shuffle($cards);
            }

            public function pick(array $items): int
            {
                return $this->picks[] = $this->inner->pick($items);
            }
        };

        $now = 1000;
        $engine = GameEngine::begin($players, $settings, $randomizer, $now, 1);
        $checksums = [self::checksum($engine, $settings, $now, null)];
        $steps = [];
        $nextLateId = 100;

        for ($i = 0; $i < $maxSteps && $engine->state()['phase'] !== GameEngine::FINISHED; $i++) {
            // Jumping to the deadline lets a tick end the reveal pause.
            $now = max($now + 1, $engine->state()['deadline'] ?? 0);
            $engine = new GameEngine($engine->state(), $settings, $randomizer, $now);
            $step = ['now' => $now, ...self::chooseStep($engine, $settings, $nextLateId)];
            $steps[] = $step;
            $checksums[] = self::checksum($engine, $settings, $now, self::apply($engine, $step));
        }

        return [
            'config' => $config,
            'players' => $players,
            'start' => 1000,
            'decks' => $randomizer->decks,
            'picks' => $randomizer->picks,
            'steps' => $steps,
            'checksums' => $checksums,
        ];
    }

    private static function chooseStep(GameEngine $engine, GameSettings $settings, int &$nextLateId): array
    {
        $state = $engine->state();

        if ($state['phase'] === GameEngine::ROUND_SUMMARY) {
            return random_int(0, 30) === 0 ? ['action' => 'end'] : ['action' => 'continue'];
        }

        $actor = $engine->currentActor();

        if ($actor === null) {
            return ['action' => 'tick'];
        }

        $limits = $engine->limitsFor($actor);
        $roll = random_int(0, 99);

        return match (true) {
            $roll < 2 => ['action' => 'remove', 'player' => $actor],
            $roll < 4 => ['action' => 'reset'],
            $roll < 6 => ['action' => 'offline', 'player' => $actor],
            $roll < 8 => ['action' => 'late', 'player' => $nextLateId++, 'name' => 'Late'],
            $roll < 12 => ['action' => 'bet', 'player' => $actor, 'amount' => ($limits['max'] ?? 0) + 1],
            $roll < 15 => ['action' => 'bet', 'player' => $state['seats'][0], 'amount' => 1],
            $limits !== null && $roll < 70 => ['action' => 'bet', 'player' => $actor, 'amount' => random_int($limits['min'], $limits['max'])],
            default => ['action' => 'pass', 'player' => $actor],
        };
    }

    /**
     * @return string|null The rejection reason, when the rules refused the action.
     */
    private static function apply(GameEngine $engine, array $step): ?string
    {
        try {
            match ($step['action']) {
                'bet' => $engine->placeBet($step['player'], $step['amount']),
                'pass' => $engine->pass($step['player']),
                'offline' => $engine->passOffline($step['player']),
                'remove' => $engine->removePlayer($step['player']),
                'late' => $engine->addLatePlayer($step['player'], $step['name']),
                'reset' => $engine->requestReset(),
                'continue' => $engine->continueToNextRound(),
                'end' => $engine->endGame(),
                'tick' => $engine->tick(),
            };
        } catch (GameRuleException $exception) {
            return $exception->reason;
        }

        return null;
    }

    private static function checksum(GameEngine $engine, GameSettings $settings, int $now, ?string $rejected): string
    {
        $state = $engine->state();
        $firstSeat = $state['seats'][0];

        return hash('sha256', json_encode(self::canonical([
            'state' => $state,
            'events' => $engine->events(),
            'transactions' => $engine->transactions(),
            'view' => StateView::forViewer($state, $settings, $firstSeat, $now),
            'actor' => $engine->currentActor(),
            'rejected' => $rejected,
        ]), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    /**
     * Sorts object keys, so that key order can't affect the checksum in either language. Player
     * ids sort as numbers because that is the order JavaScript always gives integer-like keys.
     */
    private static function canonical(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        if (! array_is_list($value)) {
            ksort($value);
        }

        return array_map(fn (mixed $item) => self::canonical($item), $value);
    }
}
