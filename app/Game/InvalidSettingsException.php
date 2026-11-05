<?php

namespace App\Game;

use InvalidArgumentException;

final class InvalidSettingsException extends InvalidArgumentException
{
    /**
     * @param  array<string, string>  $errors
     */
    public function __construct(public readonly array $errors)
    {
        parent::__construct(implode(' ', $errors));
    }
}
