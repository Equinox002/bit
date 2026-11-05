<?php

namespace Tests\Unit\Game;

use App\Game\BettingCalculator;
use App\Game\GameEngine;
use App\Game\GameRuleException;
use App\Game\GameSettings;
use App\Game\InvalidSettingsException;
use App\Game\Ledger;
use App\Game\SecureRandomizer;
use App\Game\StateValidator;
use LogicException;

class LedgerTest extends EngineTestCase
{
    public function test_every_entry_chains_previous_and_new_balances(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D']);
        $engine->placeBet(1, 10);
        $engine->placeBet(2, 20);

        $balances = [];

        foreach ($engine->transactions() as $entry) {
            $key = $entry['account'] === 'player' ? 'player'.$entry['playerId'] : $entry['account'];

            $this->assertSame($balances[$key] ?? 0, $entry['previous'], "Broken chain on {$key}.");
            $this->assertSame($entry['previous'] + $entry['amount'], $entry['new']);
            $balances[$key] = $entry['new'];
        }

        $this->assertSame($engine->state()['pot'], $balances['pot']);
        $this->assertSame($engine->state()['escrow'], $balances['escrow']);
        $this->assertSame($this->chips($engine, 1), $balances['player1']);
        $this->assertSame($this->chips($engine, 2), $balances['player2']);
    }

    public function test_settlement_records_the_expected_entries(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D']);
        $engine->placeBet(1, 10);
        $engine->placeBet(2, 20);

        $forPlayer = fn (string $type, int $id) => array_values(array_filter(
            $engine->transactions(),
            fn ($entry) => $entry['type'] === $type && $entry['playerId'] === $id && $entry['account'] === 'player',
        ));

        $this->assertSame(-10, $forPlayer(Ledger::BET_RESERVE, 1)[0]['amount']);
        $this->assertSame(10, $forPlayer(Ledger::BET_RETURN, 1)[0]['amount']);
        $this->assertSame(10, $forPlayer(Ledger::WIN_PROFIT, 1)[0]['amount']);
        $this->assertSame(20, $forPlayer(Ledger::WIN_PROFIT, 2)[0]['amount']);
    }

    public function test_ledger_refuses_to_take_the_pot_negative(): void
    {
        $state = ['pot' => 5, 'escrow' => 0, 'issued' => 5, 'players' => [1 => ['chips' => 0]], 'round' => null, 'turn' => null];
        $ledger = new Ledger($state);

        $this->expectException(LogicException::class);
        $ledger->move(Ledger::WIN_PROFIT, 'pot', 'player', 1, 6);
    }

    public function test_seed_is_the_only_way_a_pot_gets_chips_without_a_player_paying(): void
    {
        $engine = $this->game($this->threePlayerExample(), [], ['potSeed' => 50]);

        $this->assertSame(80, $engine->state()['pot']);
        $this->assertSame(3050, $engine->state()['issued']);
        $this->assertContains(Ledger::SEED, array_column($engine->transactions(), 'type'));
        $this->assertInvariants($engine);
    }

    public function test_validator_detects_created_money_and_duplicate_cards(): void
    {
        $engine = $this->game($this->threePlayerExample());
        $state = $engine->state();

        $created = $state;
        $created['pot'] += 1;
        $this->assertNotEmpty(StateValidator::violations($created));

        $duplicated = $state;
        $duplicated['deck'][] = 'AH';
        $this->assertNotEmpty(StateValidator::violations($duplicated));

        $negative = $state;
        $negative['pot'] = -1;
        $negative['issued'] -= 31;
        $this->assertNotEmpty(StateValidator::violations($negative));
    }

    public function test_settings_are_validated(): void
    {
        foreach ([
            ['minPlayers' => 1],
            ['maxPlayers' => 40],
            ['multiplier' => 100],
            ['minPlayers' => 8, 'maxPlayers' => 4],
            ['minBet' => 50, 'maxBet' => 10],
            ['contribution' => 5000],
            ['contribution' => 0],
            ['allowSelfBet' => false, 'allowOthers' => false],
            ['bettingOrder' => 'sideways'],
            ['aceHigh' => 'yes'],
            ['turnTimeout' => 'soon'],
        ] as $invalid) {
            try {
                GameSettings::fromArray($invalid);
                $this->fail('Should reject: '.json_encode($invalid));
            } catch (InvalidSettingsException $exception) {
                $this->assertNotEmpty($exception->errors);
            }
        }
    }

    public function test_presets_are_all_valid(): void
    {
        $presets = GameSettings::presetValues();

        $this->assertArrayHasKey('quick', $presets);
        $this->assertArrayHasKey('classic', $presets);
        $this->assertArrayHasKey('custom', $presets);
        $this->assertSame(20, GameSettings::preset('quick')->turnTimeout);
    }

    /**
     * Plays many random games with many rule combinations, checking every invariant after every
     * action and replaying the ledger at the end. This is what would catch a rare accounting bug.
     */
    public function test_random_games_never_break_the_accounting(): void
    {
        $randomizer = new SecureRandomizer();
        $configurations = [
            [],
            ['multiplier' => 300],
            ['multiplier' => 150],
            ['maxBet' => 50, 'minBet' => 5],
            ['inclusiveBoundaries' => true],
            ['aceHigh' => true, 'allowSkip' => false],
            ['allowSelfBet' => false, 'bettingOrder' => 'counterclockwise'],
            ['maxCycles' => 2, 'dealerRotation' => false],
            ['maxCycles' => 0],
            ['startingChips' => 60, 'contribution' => 20, 'minBet' => 5],
            ['deckEmptyRule' => 'reshuffle', 'narrowTiming' => 'after_cycle'],
            ['consecutiveHandling' => 'replace', 'identicalHandling' => 'replace', 'potSeed' => 25],
            ['endOnPotExhausted' => false, 'maxParticipants' => 2],
        ];

        foreach ($configurations as $config) {
            $settings = GameSettings::fromArray($config);

            for ($game = 0; $game < 25; $game++) {
                $this->playRandomGame($settings, $randomizer, random_int(2, 8));
            }
        }
    }

    private function playRandomGame(GameSettings $settings, SecureRandomizer $randomizer, int $playerCount): void
    {
        $players = array_map(fn (int $id) => ['id' => $id, 'name' => "P{$id}"], range(1, $playerCount));
        $now = 1000;
        $engine = GameEngine::begin($players, $settings, $randomizer, $now, 1);
        $ledger = $engine->transactions();

        for ($step = 0; $step < 300 && $engine->state()['phase'] !== GameEngine::FINISHED; $step++) {
            // Jumping to the deadline lets a tick end the reveal pause.
            $now = max($now + 1, $engine->state()['deadline'] ?? 0);
            $engine = new GameEngine($engine->state(), $settings, $randomizer, $now);
            $this->randomStep($engine);
            array_push($ledger, ...$engine->transactions());

            $this->assertSame([], StateValidator::violations($engine->state()));
            $this->assertGreaterThanOrEqual(0, $engine->state()['pot']);
        }

        $this->assertLedgerMatchesState($ledger, $engine->state());
    }

    private function randomStep(GameEngine $engine): void
    {
        $state = $engine->state();

        if ($state['phase'] === GameEngine::ROUND_SUMMARY) {
            random_int(0, 30) === 0 ? $engine->endGame() : $engine->continueToNextRound();

            return;
        }

        $actor = $engine->currentActor();

        if ($actor === null) {
            $engine->tick();

            return;
        }

        $limits = $engine->limitsFor($actor);

        match (true) {
            random_int(0, 200) === 0 => $engine->removePlayer($actor),
            random_int(0, 100) === 0 && $state['turn']['bets'] === [] => $this->tryReset($engine),
            $limits !== null && random_int(0, 2) > 0 => $engine->placeBet($actor, random_int($limits['min'], $limits['max'])),
            default => $engine->pass($actor),
        };
    }

    private function tryReset(GameEngine $engine): void
    {
        try {
            $engine->requestReset();
        } catch (GameRuleException) {
        }
    }

    private function assertLedgerMatchesState(array $ledger, array $state): void
    {
        $balances = ['pot' => 0, 'escrow' => 0];

        foreach ($ledger as $entry) {
            $key = $entry['account'] === 'player' ? 'player'.$entry['playerId'] : $entry['account'];
            $this->assertSame($balances[$key] ?? 0, $entry['previous']);
            $balances[$key] = $entry['new'];
        }

        $this->assertSame($state['pot'], $balances['pot']);
        $this->assertSame($state['escrow'], $balances['escrow']);

        foreach ($state['players'] as $player) {
            $this->assertSame($player['chips'], $balances['player'.$player['id']]);
        }
    }
}
