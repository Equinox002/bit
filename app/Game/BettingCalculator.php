<?php

namespace App\Game;

/**
 * Bet limits and payouts. The multiplier is held in hundredths, so 2x is 200 and 1.5x is 150.
 */
final class BettingCalculator
{
    /**
     * What the pot pays on top of the returned stake when a bet wins.
     */
    public static function profit(int $stake, int $multiplier): int
    {
        return intdiv($stake * ($multiplier - 100), 100);
    }

    /**
     * The largest new stake the pot can still fund, given the stakes already accepted this turn.
     *
     * @param  list<int>  $stakes
     */
    public static function available(int $pot, array $stakes, int $multiplier): int
    {
        $remaining = $pot;

        foreach ($stakes as $stake) {
            $remaining -= self::profit($stake, $multiplier);
        }

        if ($remaining <= 0) {
            return 0;
        }

        return intdiv(($remaining + 1) * 100 - 1, $multiplier - 100);
    }

    /**
     * @param  list<int>  $stakes
     * @return array{min: int, max: int, available: int}|null Null when this player cannot bet at all.
     */
    public static function limits(int $pot, array $stakes, int $chips, GameSettings $settings): ?array
    {
        $available = self::available($pot, $stakes, $settings->multiplier);

        if ($available <= 0) {
            return null;
        }

        $min = min($settings->minBet, $available);
        $max = min($available, $chips);

        if ($settings->maxBet > 0) {
            $max = min($max, $settings->maxBet);
        }

        return $max < $min ? null : ['min' => $min, 'max' => $max, 'available' => $available];
    }
}
