<?php

namespace App\Game;

interface Randomizer
{
    /**
     * @param  list<string>  $cards
     * @return list<string>
     */
    public function shuffle(array $cards): array;

    /**
     * @param  list<int>  $items
     */
    public function pick(array $items): int;
}
