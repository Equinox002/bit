<?php

namespace Tests\Support;

use App\Game\Randomizer;

/**
 * Returns the shuffles and picks recorded from an earlier game, in the same order.
 */
final class ReplayRandomizer implements Randomizer
{
    public function __construct(private array $decks, private array $picks)
    {
    }

    public function shuffle(array $cards): array
    {
        return array_shift($this->decks);
    }

    public function pick(array $items): int
    {
        return array_shift($this->picks);
    }
}
