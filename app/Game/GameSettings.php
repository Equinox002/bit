<?php

namespace App\Game;

/**
 * Validated, immutable room rules.
 *
 * @property-read int $minPlayers
 * @property-read int $maxPlayers
 * @property-read bool $allowLateJoin
 * @property-read int $turnTimeout
 * @property-read int $startingChips
 * @property-read int $contribution
 * @property-read int $potSeed
 * @property-read int $minBet
 * @property-read int $maxBet
 * @property-read int $multiplier
 * @property-read bool $allowSelfBet
 * @property-read bool $allowOthers
 * @property-read bool $allowSkip
 * @property-read int $maxParticipants
 * @property-read string $bettingOrder
 * @property-read bool $endOnPotExhausted
 * @property-read bool $aceHigh
 * @property-read bool $inclusiveBoundaries
 * @property-read string $identicalHandling
 * @property-read string $consecutiveHandling
 * @property-read string $deckEmptyRule
 * @property-read string $cardVisibility
 * @property-read bool $autoReset
 * @property-read int $narrowMaxGap
 * @property-read int $narrowMinPlayers
 * @property-read int $narrowPercent
 * @property-read string $narrowTiming
 * @property-read bool $allowManualReset
 * @property-read int $maxCycles
 * @property-read bool $resetOnIdleCycle
 * @property-read bool $contributeEveryRound
 * @property-read bool $dealerRotation
 * @property-read string $startingPlayer
 * @property-read string $hostPolicy
 */
final class GameSettings
{
    public const MAX_SEATS = 12;

    /**
     * name => [default, type, min or allowed values, max]
     */
    private const SCHEMA = [
        'minPlayers' => [2, 'int', 2, self::MAX_SEATS],
        'maxPlayers' => [8, 'int', 2, self::MAX_SEATS],
        'allowLateJoin' => [false, 'bool'],
        'turnTimeout' => [30, 'int', 10, 300],
        'startingChips' => [1000, 'int', 1, 10000000],
        'contribution' => [10, 'int', 0, 1000000],
        'potSeed' => [0, 'int', 0, 10000000],
        'minBet' => [10, 'int', 1, 1000000],
        'maxBet' => [0, 'int', 0, 10000000], // 0 means no limit beyond the pot and the player's chips.
        'multiplier' => [200, 'int', 110, 1000],
        'allowSelfBet' => [true, 'bool'],
        'allowOthers' => [true, 'bool'],
        'allowSkip' => [true, 'bool'],
        'maxParticipants' => [0, 'int', 0, self::MAX_SEATS], // 0 means everyone may participate.
        'bettingOrder' => ['clockwise', 'enum', ['clockwise', 'counterclockwise']],
        'endOnPotExhausted' => [true, 'bool'],
        'aceHigh' => [false, 'bool'],
        'inclusiveBoundaries' => [false, 'bool'],
        'identicalHandling' => ['skip', 'enum', ['skip', 'replace']],
        'consecutiveHandling' => ['skip', 'enum', ['skip', 'replace']],
        'deckEmptyRule' => ['reset', 'enum', ['reset', 'reshuffle']],
        'cardVisibility' => ['open', 'enum', ['open', 'hidden']],
        'autoReset' => [true, 'bool'],
        'narrowMaxGap' => [2, 'int', 0, 11],
        'narrowMinPlayers' => [2, 'int', 1, self::MAX_SEATS],
        'narrowPercent' => [51, 'int', 1, 100],
        'narrowTiming' => ['immediate', 'enum', ['immediate', 'after_cycle']],
        'allowManualReset' => [true, 'bool'],
        'maxCycles' => [1, 'int', 0, 100], // 0 means no limit.
        'resetOnIdleCycle' => [true, 'bool'],
        'contributeEveryRound' => [true, 'bool'],
        'dealerRotation' => [true, 'bool'],
        'startingPlayer' => ['random', 'enum', ['random', 'host', 'first_seat']],
        'hostPolicy' => ['next_seat', 'enum', ['next_seat', 'longest_member', 'none']],
    ];

    private const PRESETS = [
        'quick' => [
            'maxPlayers' => 6,
            'turnTimeout' => 20,
            'startingChips' => 500,
            'contribution' => 20,
            'minBet' => 10,
        ],
        'classic' => [],
        'custom' => [],
    ];

    /**
     * @param  array<string, mixed>  $values
     */
    private function __construct(private readonly array $values)
    {
    }

    /**
     * @param  array<string, mixed>  $input
     *
     * @throws InvalidSettingsException
     */
    public static function fromArray(array $input): self
    {
        $values = [];
        $errors = [];

        foreach (self::SCHEMA as $name => $rule) {
            $value = $input[$name] ?? $rule[0];
            $parsed = self::parse($value, $rule);

            if ($parsed === null) {
                $errors[$name] = self::describe($name, $rule);
            } else {
                $values[$name] = $parsed;
            }
        }

        if ($errors === []) {
            $errors = self::crossFieldErrors($values);
        }

        if ($errors !== []) {
            throw new InvalidSettingsException($errors);
        }

        return new self($values);
    }

    public static function preset(string $name, array $overrides = []): self
    {
        return self::fromArray([...(self::PRESETS[$name] ?? []), ...$overrides]);
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function presetValues(): array
    {
        return array_map(fn (array $preset) => self::fromArray($preset)->toArray(), self::PRESETS);
    }

    public function __get(string $name): mixed
    {
        if (! array_key_exists($name, $this->values)) {
            throw new \InvalidArgumentException("Unknown game setting [{$name}].");
        }

        return $this->values[$name];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->values;
    }

    private static function parse(mixed $value, array $rule): int|bool|string|null
    {
        return match ($rule[1]) {
            'bool' => is_bool($value) ? $value : null,
            'enum' => is_string($value) && in_array($value, $rule[2], true) ? $value : null,
            'int' => is_numeric($value) && (int) $value == $value && $value >= $rule[2] && $value <= $rule[3]
                ? (int) $value
                : null,
        };
    }

    private static function describe(string $name, array $rule): string
    {
        return match ($rule[1]) {
            'bool' => "{$name} must be true or false.",
            'enum' => "{$name} must be one of: ".implode(', ', $rule[2]).'.',
            'int' => "{$name} must be a whole number between {$rule[2]} and {$rule[3]}.",
        };
    }

    /**
     * @return array<string, string>
     */
    private static function crossFieldErrors(array $v): array
    {
        $errors = [];

        if ($v['minPlayers'] > $v['maxPlayers']) {
            $errors['minPlayers'] = 'Minimum players cannot exceed maximum players.';
        }

        if ($v['contribution'] > $v['startingChips']) {
            $errors['contribution'] = 'The contribution cannot exceed the starting chips.';
        }

        if ($v['contribution'] + $v['potSeed'] < 1) {
            $errors['contribution'] = 'Set a contribution or a pot seed, or the pot would start empty.';
        }

        if ($v['maxBet'] > 0 && $v['minBet'] > $v['maxBet']) {
            $errors['minBet'] = 'The minimum bet cannot exceed the maximum bet.';
        }

        if ($v['minBet'] > $v['startingChips']) {
            $errors['minBet'] = 'The minimum bet cannot exceed the starting chips.';
        }

        if (! $v['allowSelfBet'] && ! $v['allowOthers']) {
            $errors['allowOthers'] = 'Allow self-betting, other players, or both, or nobody could bet.';
        }

        return $errors;
    }
}
