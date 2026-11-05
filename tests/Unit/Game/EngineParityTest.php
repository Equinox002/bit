<?php

namespace Tests\Unit\Game;

use PHPUnit\Framework\TestCase;
use Tests\Support\EngineParity;

class EngineParityTest extends TestCase
{
    /**
     * The JavaScript engine is checked against these recordings by `npm run test:engine`. This
     * test fails if the PHP rules change without regenerating them, so neither side can drift.
     */
    public function test_recorded_games_still_match_the_php_engine(): void
    {
        $fixture = json_decode(file_get_contents(EngineParity::FIXTURE), true);

        $this->assertNotEmpty($fixture['games']);

        foreach ($fixture['games'] as $index => $game) {
            $this->assertSame($game['checksums'], EngineParity::replay($game), "Recorded game {$index} no longer matches.");
        }
    }
}
