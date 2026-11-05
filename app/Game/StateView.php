<?php

namespace App\Game;

/**
 * The part of the game state one player may see. The undealt deck never leaves the server; only
 * its size does. In hidden-card rooms, other players' hands stay hidden until their turn.
 */
final class StateView
{
    public static function forViewer(array $state, GameSettings $settings, ?int $viewerId, int $now): array
    {
        $engine = new GameEngine($state, $settings, new SecureRandomizer(), $now);
        $turn = $state['turn'];
        $actor = $engine->currentActor();
        $players = [];

        foreach ($state['seats'] as $id) {
            $player = $state['players'][$id];
            $showHand = self::handVisible($state, $settings, $id, $viewerId);
            $stake = 0;

            foreach ($turn['bets'] ?? [] as $bet) {
                $stake = $bet['playerId'] === $id ? $bet['amount'] : $stake;
            }

            $players[] = [
                'id' => $id,
                'name' => $player['name'],
                'chips' => $player['chips'],
                'status' => $player['status'],
                'hand' => $showHand ? $player['hand'] : null,
                'hasHand' => $player['hand'] !== null,
                'totalWon' => $player['totalWon'],
                'totalLost' => $player['totalLost'],
                'net' => $player['totalWon'] - $player['totalLost'],
                'bet' => $stake,
            ];
        }

        $stakes = array_column($turn['bets'] ?? [], 'amount');

        return [
            'phase' => $state['phase'],
            'pot' => $state['pot'],
            'committed' => array_sum($stakes),
            'available' => BettingCalculator::available($state['pot'], $stakes, $settings->multiplier),
            'deckCount' => count($state['deck']),
            'players' => $players,
            'round' => $state['round'] === null ? null : [
                'number' => $state['round']['number'],
                'cycle' => $state['round']['cycle'] ?? 1,
                'dealerId' => $state['round']['dealerId'] ?? null,
                'startingPlayerId' => $state['round']['startingPlayerId'] ?? null,
                'cardsDrawn' => $state['round']['cardsDrawn'] ?? 0,
            ],
            'turn' => $turn === null ? null : [
                'number' => $turn['number'],
                'activeId' => $turn['activeId'],
                'stage' => $turn['stage'],
                'askedId' => $turn['askedId'],
                'queue' => $turn['queue'],
                'bets' => $turn['bets'],
                'declined' => $turn['declined'],
                'cards' => $turn['cards'],
                'rangeLabel' => $turn['rangeLabel'],
                'gap' => $turn['gap'],
            ],
            'pendingReset' => $state['pendingReset'],
            'lastResult' => $state['lastResult'],
            'lastSummary' => $state['lastSummary'],
            'history' => $state['history'],
            'log' => $state['log'],
            'final' => $state['final'],
            'deadline' => $state['deadline'],
            'serverTime' => $now,
            'you' => [
                'mustAct' => $viewerId !== null && $actor === $viewerId,
                'limits' => $viewerId !== null && $actor === $viewerId ? $engine->limitsFor($viewerId) : null,
            ],
        ];
    }

    private static function handVisible(array $state, GameSettings $settings, int $id, ?int $viewerId): bool
    {
        return $settings->cardVisibility === 'open'
            || $id === $viewerId
            || ($state['turn']['activeId'] ?? null) === $id
            || $state['phase'] !== GameEngine::PLAYING;
    }
}
