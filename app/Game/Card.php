<?php

namespace App\Game;

/**
 * Cards are plain strings such as "AH" or "10S" so that game state serializes cleanly.
 */
final class Card
{
    public const SUITS = ['H', 'D', 'C', 'S'];

    public const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    public static function rank(string $card): string
    {
        return substr($card, 0, -1);
    }

    public static function suit(string $card): string
    {
        return substr($card, -1);
    }

    public static function value(string $card, bool $aceHigh = false): int
    {
        $index = array_search(self::rank($card), self::RANKS, true);

        if ($index === false) {
            throw new \InvalidArgumentException("Unknown card [{$card}].");
        }

        return $index === 0 && $aceHigh ? 14 : $index + 1;
    }
}
