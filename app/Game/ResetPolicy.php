<?php

namespace App\Game;

final class ResetPolicy
{
    /**
     * Whether enough hands are narrow to justify a new deal. Both thresholds must be met.
     *
     * @param  list<array{0: string, 1: string}>  $hands
     */
    public static function narrowRangeTriggered(array $hands, GameSettings $settings): bool
    {
        if (! $settings->autoReset || $hands === []) {
            return false;
        }

        $narrow = count(array_filter(
            $hands,
            fn (array $hand) => CardRange::gap($hand[0], $hand[1], $settings) <= $settings->narrowMaxGap,
        ));

        return $narrow >= $settings->narrowMinPlayers
            && $narrow * 100 >= $settings->narrowPercent * count($hands);
    }

    /**
     * True when no hand can win with any card left in the deck.
     *
     * @param  list<array{0: string, 1: string}>  $hands
     * @param  list<string>  $deck
     */
    public static function noValidPredictions(array $hands, array $deck, GameSettings $settings): bool
    {
        foreach ($hands as $hand) {
            foreach ($deck as $card) {
                if (CardRange::wins($card, $hand[0], $hand[1], $settings)) {
                    return false;
                }
            }
        }

        return true;
    }
}
