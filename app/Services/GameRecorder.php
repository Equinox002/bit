<?php

namespace App\Services;

use App\Game\GameEngine;
use App\Models\Bet;
use App\Models\BettingCycle;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\PlayerCard;
use App\Models\PlayerStatistic;
use App\Models\RoomMember;
use App\Models\Round;
use App\Models\Transaction;
use App\Models\Turn;
use Illuminate\Support\Str;

/**
 * Writes what the engine did into the history tables, so a game can be audited and reconstructed.
 * Runs inside the same transaction as the action, so history and state can never disagree.
 */
class GameRecorder
{
    public function record(GameRoom $room, GameSession $session, GameEngine $engine): void
    {
        $state = $engine->state();

        foreach ($engine->events() as $event) {
            match ($event['type']) {
                'round:start' => $this->roundStarted($session, $state),
                'cycle:start' => $this->cycleStarted($session, $state, $event['data']),
                'hand:replaced' => $this->handReplaced($session, $state, $event['data']),
                'game:result' => $this->turnSettled($session, $state, $event['data']),
                'round:reset' => $this->roundEnded($session, $state),
                'game:finished' => $this->gameFinished($room, $session, $state, $event['data']),
                default => null,
            };
        }

        $this->writeLedger($room, $session, $engine->transactions());
    }

    private function roundStarted(GameSession $session, array $state): void
    {
        $round = Round::create([
            'game_session_id' => $session->id,
            'number' => $state['round']['number'],
            'starting_member_id' => $state['round']['startingPlayerId'],
            'dealer_member_id' => $state['round']['dealerId'],
            'starting_pot' => $state['round']['startingPot'],
            'redeals' => $state['round']['redeals'],
        ]);

        foreach ($state['round']['order'] as $memberId) {
            $hand = $state['players'][$memberId]['hand'];

            PlayerCard::create([
                'round_id' => $round->id,
                'room_member_id' => $memberId,
                'card_1' => $hand[0],
                'card_2' => $hand[1],
            ]);
        }
    }

    private function handReplaced(GameSession $session, array $state, array $data): void
    {
        $hand = $state['players'][$data['playerId']]['hand'];

        PlayerCard::where('round_id', $this->roundId($session, $state['round']['number']))
            ->where('room_member_id', $data['playerId'])
            ->update(['card_1' => $hand[0], 'card_2' => $hand[1]]);
    }

    private function cycleStarted(GameSession $session, array $state, array $data): void
    {
        BettingCycle::create([
            'round_id' => $this->roundId($session, $state['round']['number']),
            'number' => $data['cycle'],
        ]);
    }

    private function turnSettled(GameSession $session, array $state, array $result): void
    {
        $roundId = $this->roundId($session, $result['roundNumber']);

        $turn = Turn::create([
            'game_session_id' => $session->id,
            'round_id' => $roundId,
            'betting_cycle_id' => BettingCycle::where('round_id', $roundId)->where('number', $result['cycle'])->value('id'),
            'number' => $result['turnNumber'],
            'active_member_id' => $result['activeId'],
            'card_1' => $result['cards'][0],
            'card_2' => $result['cards'][1],
            'range_label' => $result['rangeLabel'],
            'drawn_card' => $result['drawn'],
            'won' => $result['won'],
            'pot_before' => $result['potBefore'],
            'pot_after' => $result['potAfter'],
        ]);

        foreach ($result['outcomes'] as $outcome) {
            Bet::create([
                'turn_id' => $turn->id,
                'room_member_id' => $outcome['playerId'],
                'amount' => $outcome['stake'],
                'profit' => $outcome['profit'],
                'payout' => $outcome['payout'],
                'won' => $outcome['won'],
            ]);

            $statistic = $this->statisticFor($session, $outcome['playerId']);
            $statistic->bets_placed++;
            $statistic->bets_won += $outcome['won'] ? 1 : 0;
            $statistic->chips_won += $outcome['profit'];
            $statistic->chips_lost += $outcome['won'] ? 0 : $outcome['stake'];
            $statistic->biggest_win = max($statistic->biggest_win, $outcome['profit']);
            $statistic->save();
        }
    }

    private function roundEnded(GameSession $session, array $state): void
    {
        $summary = $state['lastSummary'];

        Round::where('game_session_id', $session->id)->where('number', $summary['number'])->update([
            'ending_pot' => $summary['endingPot'],
            'winning_bets' => $summary['winningBets'],
            'losing_bets' => $summary['losingBets'],
            'cards_drawn' => $summary['cardsDrawn'],
            'reset_reason' => $summary['reason'],
            'summary' => json_encode($summary),
            'ended_at' => now(),
        ]);
    }

    private function gameFinished(GameRoom $room, GameSession $session, array $state, array $data): void
    {
        $session->update([
            'status' => GameRoom::FINISHED,
            'end_reason' => $data['reason'],
            'final' => $state['final'],
            'ended_at' => now(),
        ]);
        $room->status = GameRoom::FINISHED;

        $standings = $state['final']['standings'];
        $topChips = max(array_column($standings, 'chips'));

        foreach ($standings as $standing) {
            $statistic = $this->statisticFor($session, $standing['playerId']);
            $statistic->games_played++;
            $statistic->games_won += $standing['chips'] === $topChips ? 1 : 0;
            $statistic->save();
        }
    }

    private function writeLedger(GameRoom $room, GameSession $session, array $entries): void
    {
        foreach ($entries as $entry) {
            Transaction::create([
                'transaction_id' => (string) Str::uuid(),
                'game_room_id' => $room->id,
                'game_session_id' => $session->id,
                'round_id' => $entry['roundNumber'] > 0 ? $this->roundId($session, $entry['roundNumber']) : null,
                'turn_number' => $entry['turnNumber'],
                'room_member_id' => $entry['playerId'],
                'type' => $entry['type'],
                'account' => $entry['account'],
                'amount' => $entry['amount'],
                'previous_balance' => $entry['previous'],
                'new_balance' => $entry['new'],
            ]);
        }
    }

    private function roundId(GameSession $session, int $number): ?int
    {
        return Round::where('game_session_id', $session->id)->where('number', $number)->value('id');
    }

    private function statisticFor(GameSession $session, int $memberId): PlayerStatistic
    {
        // Refreshing loads the column defaults, which a newly created model doesn't have.
        return PlayerStatistic::firstOrCreate([
            'user_id' => RoomMember::whereKey($memberId)->value('user_id'),
        ])->refresh();
    }
}
