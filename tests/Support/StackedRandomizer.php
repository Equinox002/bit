<?php

namespace Tests\Support;

use App\Game\Deck;
use App\Game\Randomizer;

/**
 * Deals known cards so a test can state exactly which hands and draws occur. Each shuffle uses
 * the next stack in the list, followed by every remaining card in a fixed order.
 */
final class StackedRandomizer implements Randomizer
{
    /**
     * @param  list<list<string>>  $stacks
     */
    public function __construct(private array $stacks, private readonly ?int $pick = null)
    {
    }

    public function shuffle(array $cards): array
    {
        $stack = array_shift($this->stacks) ?? [];

        return [...$stack, ...array_values(array_diff($cards, $stack))];
    }

    public function pick(array $items): int
    {
        return $this->pick ?? $items[0];
    }

    public static function fullDeck(): array
    {
        return Deck::standard();
    }
}
