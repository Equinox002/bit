<?php

namespace Tests\Unit\Game;

use App\Game\GameEngine;
use App\Game\GameSettings;
use App\Game\Randomizer;
use App\Game\StateValidator;
use PHPUnit\Framework\TestCase;
use Tests\Support\StackedRandomizer;

abstract class EngineTestCase extends TestCase
{
    protected const NOW = 1000;

    /**
     * Start a game in which player N receives hands[N - 1], followed by the given draws.
     * Player 1 starts unless told otherwise. The default contribution of 10 matches the spec's
     * three-player example, whose pot starts at 30.
     */
    protected function game(array $hands, array $draws = [], array $settings = [], int $starter = 1): GameEngine
    {
        $players = [];

        foreach (array_keys($hands) as $index) {
            $players[] = ['id' => $index + 1, 'name' => 'Player '.($index + 1)];
        }

        return GameEngine::begin(
            $players,
            GameSettings::fromArray($settings),
            new StackedRandomizer([[...array_merge(...$hands), ...$draws]], $starter),
            self::NOW,
            1,
        );
    }

    /**
     * The same game at a later moment, as a later request would see it.
     */
    protected function later(GameEngine $engine, array $settings = [], int $seconds = 1000, ?Randomizer $randomizer = null): GameEngine
    {
        return new GameEngine(
            $engine->state(),
            GameSettings::fromArray($settings),
            $randomizer ?? new StackedRandomizer([]),
            $engine->state()['deadline'] === null ? self::NOW : $engine->state()['deadline'] + $seconds,
        );
    }

    /**
     * Skip past the reveal pause so the next turn begins.
     */
    protected function nextTurn(GameEngine $engine, array $settings = []): GameEngine
    {
        $next = $this->later($engine, $settings);
        $next->tick();

        return $next;
    }

    protected function assertInvariants(GameEngine $engine): void
    {
        $this->assertSame([], StateValidator::violations($engine->state()));
    }

    protected function chips(GameEngine $engine, int $id): int
    {
        return $engine->state()['players'][$id]['chips'];
    }

    protected function eventTypes(GameEngine $engine): array
    {
        return array_column($engine->events(), 'type');
    }

    protected function threePlayerExample(): array
    {
        return [['AH', '5C'], ['5S', 'KD'], ['10H', 'QS']];
    }
}
