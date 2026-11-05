<?php

namespace App\Game;

final class SecureRandomizer implements Randomizer
{
    /**
     * Fisher-Yates using random_int, which is backed by the operating system's CSPRNG.
     */
    public function shuffle(array $cards): array
    {
        $cards = array_values($cards);

        for ($i = count($cards) - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            [$cards[$i], $cards[$j]] = [$cards[$j], $cards[$i]];
        }

        return $cards;
    }

    public function pick(array $items): int
    {
        $items = array_values($items);

        return $items[random_int(0, count($items) - 1)];
    }
}
