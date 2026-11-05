<?php

namespace App\Game;

final class Deck
{
    /**
     * @return list<string>
     */
    public static function standard(): array
    {
        $deck = [];

        foreach (Card::SUITS as $suit) {
            foreach (Card::RANKS as $rank) {
                $deck[] = $rank.$suit;
            }
        }

        return $deck;
    }

    /**
     * @return list<string>
     */
    public static function shuffled(Randomizer $randomizer): array
    {
        return $randomizer->shuffle(self::standard());
    }
}
