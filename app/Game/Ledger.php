<?php

namespace App\Game;

use LogicException;

/**
 * The only code allowed to change balances. Every change produces an auditable entry, and a
 * balance that would go negative stops the action instead of being recorded.
 */
final class Ledger
{
    public const ISSUE = 'chips_issued';

    public const SEED = 'pot_seed';

    public const CONTRIBUTION = 'contribution';

    public const BET_RESERVE = 'bet_reserve';

    public const BET_RETURN = 'bet_return';

    public const WIN_PROFIT = 'win_profit';

    public const BET_LOSS = 'bet_loss';

    public const REFUND = 'bet_refund';

    public const FINAL_SPLIT = 'final_split';

    /** @var list<array<string, mixed>> */
    private array $entries = [];

    public function __construct(private array &$state)
    {
    }

    /**
     * Bring new chips into the game. Only called when chips are issued to a player or the room
     * seeds the pot, and the total is tracked so that nothing else can create money.
     */
    public function issue(string $type, ?int $playerId, int $amount): void
    {
        $this->state['issued'] += $amount;
        $this->change($type, $playerId === null ? 'pot' : 'player', $playerId, $amount);
    }

    public function move(string $type, string $from, string $to, ?int $playerId, int $amount): void
    {
        if ($amount === 0) {
            return;
        }

        $this->change($type, $from, $from === 'player' ? $playerId : null, -$amount, $playerId);
        $this->change($type, $to, $to === 'player' ? $playerId : null, $amount, $playerId);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function entries(): array
    {
        return $this->entries;
    }

    private function change(string $type, string $account, ?int $accountOwner, int $amount, ?int $onBehalfOf = null): void
    {
        $previous = match ($account) {
            'player' => $this->state['players'][$accountOwner]['chips'],
            'pot' => $this->state['pot'],
            'escrow' => $this->state['escrow'],
        };
        $new = $previous + $amount;

        if ($new < 0) {
            throw new LogicException("Ledger refused to take the {$account} balance below zero.");
        }

        match ($account) {
            'player' => $this->state['players'][$accountOwner]['chips'] = $new,
            'pot' => $this->state['pot'] = $new,
            'escrow' => $this->state['escrow'] = $new,
        };

        $this->entries[] = [
            'type' => $type,
            'account' => $account,
            'playerId' => $accountOwner ?? $onBehalfOf,
            'amount' => $amount,
            'previous' => $previous,
            'new' => $new,
            'roundNumber' => $this->state['round']['number'] ?? 0,
            'turnNumber' => $this->state['turn']['number'] ?? null,
        ];
    }
}
