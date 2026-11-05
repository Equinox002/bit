<?php

namespace App\Game;

/**
 * Rank comparison and the winning range of a two-card hand. Suits never affect the result.
 */
final class CardRange
{
    /**
     * @return list<int> Rank values that win for this hand.
     */
    public static function winningValues(string $first, string $second, GameSettings $settings): array
    {
        $a = Card::value($first, $settings->aceHigh);
        $b = Card::value($second, $settings->aceHigh);
        [$low, $high] = [min($a, $b), max($a, $b)];

        if ($settings->inclusiveBoundaries) {
            return range($low, $high);
        }

        return $high - $low < 2 ? [] : range($low + 1, $high - 1);
    }

    /**
     * The number of winning ranks: 2-4 has a gap of 1 and 3-K has a gap of 9.
     */
    public static function gap(string $first, string $second, GameSettings $settings): int
    {
        return count(self::winningValues($first, $second, $settings));
    }

    public static function wins(string $drawn, string $first, string $second, GameSettings $settings): bool
    {
        return in_array(
            Card::value($drawn, $settings->aceHigh),
            self::winningValues($first, $second, $settings),
            true,
        );
    }

    public static function label(string $first, string $second, GameSettings $settings): string
    {
        $a = Card::value($first, $settings->aceHigh);
        $b = Card::value($second, $settings->aceHigh);

        return $a <= $b
            ? Card::rank($first).'–'.Card::rank($second)
            : Card::rank($second).'–'.Card::rank($first);
    }

    public static function isIdentical(string $first, string $second): bool
    {
        return Card::rank($first) === Card::rank($second);
    }
}
