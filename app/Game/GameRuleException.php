<?php

namespace App\Game;

use RuntimeException;

/**
 * A player action the rules do not allow. The code is stable and safe to show to clients.
 */
final class GameRuleException extends RuntimeException
{
    public function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }
}
