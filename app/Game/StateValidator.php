<?php

namespace App\Game;

use LogicException;

/**
 * Checks the invariants that must hold after every action. A failure means a bug, so the caller
 * rolls back instead of saving a corrupted game.
 */
final class StateValidator
{
    /**
     * @return list<string> Every violated invariant.
     */
    public static function violations(array $state): array
    {
        $problems = [];
        $playerChips = 0;
        $cards = [...$state['deck'], ...$state['discard']];

        foreach ($state['players'] as $player) {
            $playerChips += $player['chips'];

            if ($player['chips'] < 0) {
                $problems[] = "Player {$player['id']} has negative chips.";
            }

            if ($player['hand'] !== null) {
                array_push($cards, ...$player['hand']);
            }
        }

        if ($state['pot'] < 0) {
            $problems[] = 'The pot is negative.';
        }

        if ($state['escrow'] < 0) {
            $problems[] = 'Escrow is negative.';
        }

        if ($playerChips + $state['pot'] + $state['escrow'] !== $state['issued']) {
            $problems[] = 'Chips in play do not match chips issued.';
        }

        $unsettled = 0;

        if (($state['turn']['stage'] ?? 'reveal') !== 'reveal') {
            $unsettled = array_sum(array_column($state['turn']['bets'], 'amount'));
        }

        if ($state['escrow'] !== $unsettled) {
            $problems[] = 'Escrow does not match the unsettled bets.';
        }

        if (count($cards) !== count(array_unique($cards))) {
            $problems[] = 'A card appears more than once.';
        }

        return $problems;
    }

    public static function assertValid(array $state): void
    {
        $problems = self::violations($state);

        if ($problems !== []) {
            throw new LogicException('Invalid game state: '.implode(' ', $problems));
        }
    }
}
