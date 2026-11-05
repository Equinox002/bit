<?php

namespace Tests\Unit\Game;

use App\Game\BettingCalculator;
use App\Game\GameEngine;
use App\Game\GameRuleException;
use App\Game\GameSettings;

class BettingTest extends EngineTestCase
{
    public function test_game_starts_with_two_cards_each_and_a_pot_from_contributions(): void
    {
        $engine = $this->game($this->threePlayerExample());
        $state = $engine->state();

        $this->assertSame(30, $state['pot']);
        $this->assertSame(['AH', '5C'], $state['players'][1]['hand']);
        $this->assertSame(['5S', 'KD'], $state['players'][2]['hand']);
        $this->assertSame(['10H', 'QS'], $state['players'][3]['hand']);
        $this->assertCount(46, $state['deck']);
        $this->assertSame(990, $this->chips($engine, 1));
        $this->assertSame('own_bet', $state['turn']['stage']);
        $this->assertSame(1, $engine->currentActor());
        $this->assertInvariants($engine);
    }

    public function test_spec_winning_scenario_pays_each_player_double_from_the_pot(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D']);

        $engine->placeBet(1, 10);
        $this->assertSame(2, $engine->currentActor());
        $this->assertSame(20, $engine->limitsFor(2)['available']);

        $engine->placeBet(2, 20);

        $state = $engine->state();
        $this->assertSame(0, $state['pot']);
        $this->assertTrue($state['lastResult']['won']);
        $this->assertSame('3D', $state['lastResult']['drawn']);
        $this->assertSame(20, $state['lastResult']['outcomes'][0]['payout']);
        $this->assertSame(40, $state['lastResult']['outcomes'][1]['payout']);
        $this->assertSame(1000, $this->chips($engine, 1));
        $this->assertSame(1010, $this->chips($engine, 2));
        $this->assertSame(990, $this->chips($engine, 3));
        $this->assertInvariants($engine);
    }

    public function test_spec_exhausted_pot_means_player_3_is_never_asked(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D']);

        $engine->placeBet(1, 10);
        $engine->placeBet(2, 20);

        $this->assertNotContains(3, array_column(
            array_filter($engine->events(), fn ($event) => $event['type'] === 'bet:invite'),
            'data',
        ));
        $this->assertSame('reveal', $engine->state()['turn']['stage']);
    }

    public function test_spec_losing_scenario_adds_bets_to_the_pot_and_moves_to_player_2(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['9D']);

        $engine->placeBet(1, 10);
        $engine->placeBet(2, 20);

        $this->assertSame(60, $engine->state()['pot']);
        $this->assertFalse($engine->state()['lastResult']['won']);
        $this->assertSame(980, $this->chips($engine, 1));
        $this->assertSame(970, $this->chips($engine, 2));

        $next = $this->nextTurn($engine);

        $this->assertSame(2, $next->state()['turn']['activeId']);
        $this->assertSame('5–K', $next->state()['turn']['rangeLabel']);
        $this->assertSame(60, $next->limitsFor(2)['available']);

        $next->placeBet(2, 10);
        $this->assertSame(3, $next->currentActor(), 'Player 3 is asked next, clockwise.');

        $next->pass(3);
        $this->assertSame(1, $next->currentActor(), 'Then Player 1.');
    }

    public function test_exactly_one_card_is_drawn_per_turn(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['9D']);
        $before = count($engine->state()['deck']);

        $engine->placeBet(1, 10);
        $engine->placeBet(2, 20);

        $this->assertCount($before - 1, $engine->state()['deck']);
        $this->assertSame(['9D'], $engine->state()['discard']);
    }

    public function test_next_active_player_follows_seating_after_a_win_too(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D']);

        $engine->placeBet(1, 10);
        $engine->pass(2);
        $engine->pass(3);

        $this->assertSame(2, $this->nextTurn($engine)->state()['turn']['activeId']);
    }

    public function test_declining_player_still_gets_their_own_turn(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['9D']);

        $engine->placeBet(1, 10);
        $engine->pass(2);
        $engine->pass(3);

        $this->assertContains(2, $engine->state()['turn']['declined']);
        $this->assertSame(2, $this->nextTurn($engine)->state()['turn']['activeId']);
    }

    public function test_active_player_may_skip_their_own_bet_and_others_can_still_bet(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D']);

        $engine->pass(1);
        $this->assertSame(2, $engine->currentActor());

        $engine->placeBet(2, 10);
        $engine->pass(3);

        // Started at 990 after contributing, staked 10 and was paid 20.
        $this->assertSame(1000, $this->chips($engine, 2));
    }

    public function test_skip_ends_the_turn_when_skipping_is_not_allowed(): void
    {
        $settings = ['allowSkip' => false];
        $engine = $this->game($this->threePlayerExample(), [], $settings);

        $engine->pass(1);

        $this->assertSame(2, $engine->state()['turn']['activeId']);
        $this->assertContains('turn:no-bets', $this->eventTypes($engine));
    }

    public function test_turn_with_no_bets_draws_no_card(): void
    {
        $engine = $this->game($this->threePlayerExample());
        $before = count($engine->state()['deck']);

        $engine->pass(1);
        $engine->pass(2);
        $engine->pass(3);

        $this->assertCount($before, $engine->state()['deck']);
        $this->assertSame(2, $engine->state()['turn']['activeId']);
    }

    public function test_self_betting_can_be_turned_off(): void
    {
        $engine = $this->game($this->threePlayerExample(), [], ['allowSelfBet' => false]);

        $this->assertSame('invite', $engine->state()['turn']['stage']);
        $this->assertSame(2, $engine->currentActor());
    }

    public function test_other_players_can_be_turned_off(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D'], ['allowOthers' => false]);

        $engine->placeBet(1, 10);

        $this->assertSame('reveal', $engine->state()['turn']['stage']);
        $this->assertCount(1, $engine->state()['turn']['bets']);
    }

    public function test_counterclockwise_betting_order_only_affects_invitations(): void
    {
        $settings = ['bettingOrder' => 'counterclockwise'];
        $engine = $this->game($this->threePlayerExample(), ['9D'], $settings);

        $engine->placeBet(1, 10);
        $this->assertSame(3, $engine->currentActor());

        $engine->pass(3);
        $engine->pass(2);

        $this->assertSame(2, $this->nextTurn($engine, $settings)->state()['turn']['activeId']);
    }

    public function test_maximum_participants_stops_further_invitations(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['9D'], ['maxParticipants' => 1]);

        $engine->placeBet(1, 10);

        $this->assertSame('reveal', $engine->state()['turn']['stage']);
    }

    public function test_bet_limits_are_enforced(): void
    {
        $engine = $this->game($this->threePlayerExample(), [], ['minBet' => 5, 'maxBet' => 15]);

        foreach ([4, 16, 0, -10] as $amount) {
            try {
                $engine->placeBet(1, $amount);
                $this->fail("A bet of {$amount} should be rejected.");
            } catch (GameRuleException $exception) {
                $this->assertSame('invalid_amount', $exception->reason);
            }
        }

        $engine->placeBet(1, 15);
        $this->assertSame(2, $engine->currentActor());
    }

    public function test_a_player_cannot_bet_more_than_the_available_amount(): void
    {
        $engine = $this->game($this->threePlayerExample());
        $engine->placeBet(1, 10);

        $this->expectException(GameRuleException::class);
        $engine->placeBet(2, 21);
    }

    public function test_a_player_cannot_bet_more_chips_than_they_hold(): void
    {
        $engine = $this->game(
            $this->threePlayerExample(),
            [],
            ['startingChips' => 30, 'contribution' => 20, 'minBet' => 5],
        );

        $this->assertSame(10, $engine->limitsFor(1)['max']);
    }

    public function test_minimum_bet_drops_to_what_is_left_so_a_small_pot_cannot_stall(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['9D']);

        $engine->placeBet(1, 25);

        $this->assertSame(['min' => 5, 'max' => 5, 'available' => 5], $engine->limitsFor(2));
        $engine->placeBet(2, 5);
        $this->assertSame('reveal', $engine->state()['turn']['stage']);
    }

    public function test_higher_multiplier_reduces_what_the_pot_can_cover(): void
    {
        $settings = ['multiplier' => 300];
        $engine = $this->game($this->threePlayerExample(), ['3D'], $settings);

        $this->assertSame(15, $engine->limitsFor(1)['available']);

        $engine->placeBet(1, 10);
        $this->assertSame(5, $engine->limitsFor(2)['available']);

        $engine->placeBet(2, 5);
        $this->assertSame(0, $engine->state()['pot'], '10 and 5 at 3x cost the pot exactly 30.');
        $this->assertInvariants($engine);
    }

    public function test_fractional_multiplier_pays_whole_chips_and_is_always_funded(): void
    {
        $settings = GameSettings::fromArray(['multiplier' => 150]);

        $this->assertSame(1, BettingCalculator::profit(3, 150));
        $this->assertSame(2, BettingCalculator::profit(4, 150));
        $this->assertSame(3, BettingCalculator::available(1, [], 150));
        $this->assertSame(0, BettingCalculator::available(2, [4], 150));
        $this->assertLessThanOrEqual(
            30,
            BettingCalculator::profit(BettingCalculator::limits(30, [], 1000, $settings)['available'], 150),
        );
    }

    public function test_multiple_winners_are_all_paid(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D']);

        $engine->placeBet(1, 10);
        $engine->placeBet(2, 10);
        $engine->placeBet(3, 10);

        $this->assertSame(0, $engine->state()['pot']);
        $this->assertCount(3, array_filter($engine->state()['lastResult']['outcomes'], fn ($o) => $o['won']));
        $this->assertSame(1000, $this->chips($engine, 1));
        $this->assertSame(1000, $this->chips($engine, 2));
        $this->assertSame(1000, $this->chips($engine, 3));
    }

    public function test_multiple_losers_all_pay_into_the_pot(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['KC']);

        $engine->placeBet(1, 10);
        $engine->placeBet(2, 10);
        $engine->placeBet(3, 10);

        $this->assertSame(60, $engine->state()['pot']);
        $this->assertSame(980, $this->chips($engine, 3));
    }

    public function test_drawing_a_boundary_rank_loses_by_default(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['5D']);

        $engine->placeBet(1, 10);
        $engine->placeBet(2, 20);

        $this->assertFalse($engine->state()['lastResult']['won']);
    }

    public function test_only_the_current_actor_may_act(): void
    {
        $engine = $this->game($this->threePlayerExample());

        foreach ([fn () => $engine->placeBet(2, 10), fn () => $engine->pass(3)] as $action) {
            try {
                $action();
                $this->fail('A player acting out of turn should be rejected.');
            } catch (GameRuleException $exception) {
                $this->assertSame('not_your_turn', $exception->reason);
            }
        }

        $this->assertSame(1, $engine->currentActor());
        $this->assertSame([], $engine->state()['turn']['bets']);
    }

    public function test_a_duplicate_bet_is_rejected_and_charges_nothing(): void
    {
        $engine = $this->game($this->threePlayerExample());
        $engine->placeBet(1, 10);
        $chips = $this->chips($engine, 1);

        $this->expectException(GameRuleException::class);

        try {
            $engine->placeBet(1, 10);
        } finally {
            $this->assertSame($chips, $this->chips($engine, 1));
            $this->assertCount(1, $engine->state()['turn']['bets']);
        }
    }

    public function test_settlement_cannot_run_twice(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D']);
        $engine->placeBet(1, 10);
        $engine->placeBet(2, 20);
        $pot = $engine->state()['pot'];
        $chips = $this->chips($engine, 1);

        // Replaying a stale action on the settled turn, as a retried request would.
        foreach ([1, 2, 3] as $id) {
            try {
                $engine->placeBet($id, 10);
                $this->fail('Betting after settlement should be rejected.');
            } catch (GameRuleException) {
            }
        }

        // An early tick is ignored, so it cannot settle or advance anything either.
        $this->assertFalse((new GameEngine($engine->state(), GameSettings::fromArray([]), new \App\Game\SecureRandomizer(), self::NOW))->tick());

        $this->assertSame($pot, $engine->state()['pot']);
        $this->assertSame($chips, $this->chips($engine, 1));
        $this->assertSame(0, $engine->state()['escrow']);
    }

    public function test_competing_actions_from_the_same_state_cannot_both_apply(): void
    {
        $engine = $this->game($this->threePlayerExample());
        $engine->placeBet(1, 10);

        // Two requests arrive together: the row lock orders them, so the second sees new state.
        $engine->placeBet(2, 20);

        $this->expectException(GameRuleException::class);
        $engine->placeBet(3, 10);
    }

    public function test_timeouts_pass_for_the_current_actor(): void
    {
        $engine = $this->game($this->threePlayerExample());

        $this->assertFalse($engine->tick(), 'Nothing happens before the deadline.');

        $engine = $this->later($engine);
        $this->assertTrue($engine->tick());
        $this->assertContains('bet:skip', $this->eventTypes($engine));
        $this->assertSame(2, $engine->currentActor());

        $engine = $this->later($engine);
        $engine->tick();
        $this->assertContains('bet:decline', $this->eventTypes($engine));
        $this->assertSame(3, $engine->currentActor());
    }
}
