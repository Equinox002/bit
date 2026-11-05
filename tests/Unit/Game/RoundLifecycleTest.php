<?php

namespace Tests\Unit\Game;

use App\Game\GameEngine;
use App\Game\GameRuleException;
use App\Game\GameSettings;
use App\Game\StateView;
use Tests\Support\StackedRandomizer;

class RoundLifecycleTest extends EngineTestCase
{
    public function test_starting_player_comes_from_the_randomizer(): void
    {
        $this->assertSame(2, $this->game($this->threePlayerExample(), starter: 2)->state()['turn']['activeId']);
        $this->assertSame(3, $this->game($this->threePlayerExample(), starter: 3)->state()['turn']['activeId']);
    }

    public function test_starting_player_can_be_the_host_or_first_seat(): void
    {
        $this->assertSame(1, $this->game($this->threePlayerExample(), [], ['startingPlayer' => 'first_seat'], 3)->state()['turn']['activeId']);
        $this->assertSame(1, $this->game($this->threePlayerExample(), [], ['startingPlayer' => 'host'], 3)->state()['turn']['activeId']);
    }

    public function test_turns_rotate_clockwise_and_wrap_around(): void
    {
        $engine = $this->game($this->threePlayerExample(), starter: 2);

        $this->assertSame(2, $engine->state()['turn']['activeId']);
        $this->passWholeTurn($engine);
        $this->assertSame(3, $engine->state()['turn']['activeId']);
        $this->passWholeTurn($engine);
        $this->assertSame(1, $engine->state()['turn']['activeId']);
    }

    public function test_same_cards_carry_into_the_next_betting_cycle(): void
    {
        $settings = ['maxCycles' => 0];
        $engine = $this->game($this->threePlayerExample(), ['KC'], $settings);
        $hands = array_column($engine->state()['players'], 'hand');

        $this->assertSame(1, $engine->state()['round']['cycle']);

        // One bet in the cycle is enough to keep the same cards in play.
        $engine->placeBet(1, 10);
        $engine->pass(2);
        $engine->pass(3);
        $engine = $this->nextTurn($engine, $settings);
        $this->passWholeTurn($engine);
        $this->passWholeTurn($engine);

        $this->assertSame(2, $engine->state()['round']['cycle']);
        $this->assertSame(1, $engine->state()['turn']['activeId']);
        $this->assertSame($hands, array_column($engine->state()['players'], 'hand'));
        $this->assertSame(1, $engine->state()['round']['number']);
    }

    /**
     * The owner's example: a pot of 100, with each player winning 20 across the three turns. Once C
     * has had a turn the round ends, and the next one starts at the 40 left plus 10 from each player.
     */
    public function test_the_next_round_starts_once_everyone_has_had_a_turn(): void
    {
        $settings = ['potSeed' => 70, 'minBet' => 5];
        $engine = $this->game([['2H', 'KC'], ['3S', 'QD'], ['4C', 'JD']], ['7D', '8C', '9H'], $settings);
        $hands = array_column($engine->state()['players'], 'hand');
        $this->assertSame(100, $engine->state()['pot']);

        // A's turn: everyone bets on A.
        $engine->placeBet(1, 5);
        $engine->placeBet(2, 5);
        $engine->placeBet(3, 5);
        $engine = $this->nextTurn($engine, $settings);

        // B's turn: only B bets.
        $this->assertSame(2, $engine->state()['turn']['activeId']);
        $engine->placeBet(2, 10);
        $engine->pass(3);
        $engine->pass(1);
        $engine = $this->nextTurn($engine, $settings);

        // C's turn: everyone bets on C.
        $this->assertSame(3, $engine->state()['turn']['activeId']);
        $engine->placeBet(3, 15);
        $engine->placeBet(1, 15);
        $engine->placeBet(2, 5);
        $this->assertSame(GameEngine::PLAYING, $engine->state()['phase']);
        $engine = $this->nextTurn($engine, $settings);

        $state = $engine->state();
        $this->assertSame(GameEngine::ROUND_SUMMARY, $state['phase']);
        $this->assertSame('max_cycles', $state['lastSummary']['reason']);
        $this->assertSame(40, $state['pot']);

        foreach ([1, 2, 3] as $id) {
            $this->assertSame(1010, $this->chips($engine, $id), 'Each player has 990 after contributing, plus 20 won.');
        }

        $engine = $this->later($engine, $settings);
        $engine->continueToNextRound();

        $this->assertSame(2, $engine->state()['round']['number']);
        $this->assertSame(70, $engine->state()['pot'], 'The 40 left over, plus 10 from each player.');
        $this->assertNotSame($hands, array_column($engine->state()['players'], 'hand'));
        $this->assertSame(1000, $this->chips($engine, 1));
        $this->assertInvariants($engine);
    }

    /**
     * The owner's example: 40 left in the pot, and three players adding 10 each.
     */
    public function test_a_leftover_pot_carries_into_the_next_round_with_new_contributions(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['KC']);
        $engine->placeBet(1, 10);
        $engine->pass(2);
        $engine->pass(3);
        $engine->requestReset();
        $this->assertSame(40, $engine->state()['pot']);

        $engine = $this->nextTurn($engine);
        $this->assertSame(40, $engine->state()['lastSummary']['endingPot']);

        $engine = new GameEngine($engine->state(), GameSettings::fromArray([]), new StackedRandomizer([]), self::NOW);
        $engine->continueToNextRound();

        $this->assertSame(70, $engine->state()['pot']);
        $this->assertSame(70, $engine->state()['round']['startingPot']);
        $this->assertSame(970, $this->chips($engine, 1));
        $this->assertSame(980, $this->chips($engine, 2));
        $this->assertSame(980, $this->chips($engine, 3));
        $this->assertInvariants($engine);
    }

    public function test_contributions_can_be_limited_to_an_empty_pot(): void
    {
        $settings = ['contributeEveryRound' => false];
        $engine = $this->game($this->threePlayerExample(), ['KC'], $settings);
        $engine->placeBet(1, 10);
        $engine->pass(2);
        $engine->pass(3);
        $engine->requestReset();
        $engine = $this->nextTurn($engine, $settings);

        $engine = new GameEngine($engine->state(), GameSettings::fromArray($settings), new StackedRandomizer([]), self::NOW);
        $engine->continueToNextRound();

        $this->assertSame(40, $engine->state()['pot'], 'The leftover still carries over.');
        $this->assertSame(990, $this->chips($engine, 2));
    }

    public function test_a_player_who_cannot_contribute_sits_out_while_the_leftover_carries_over(): void
    {
        $engine = $this->game($this->threePlayerExample(), [], ['startingChips' => 100, 'contribution' => 10]);
        $state = $engine->state();
        $state['players'][3]['chips'] = 5;
        $state['issued'] = 90 + 90 + 5 + 30;
        $state['turn'] = null;
        $state['phase'] = GameEngine::ROUND_SUMMARY;

        $engine = new GameEngine($state, GameSettings::fromArray(['startingChips' => 100, 'contribution' => 10]), new StackedRandomizer([]), self::NOW);
        $engine->continueToNextRound();

        $this->assertSame('sitting_out', $engine->state()['players'][3]['status']);
        $this->assertSame(50, $engine->state()['pot']);
        $this->assertSame(5, $this->chips($engine, 3), 'Nothing is taken from a player who sits out.');
        $this->assertInvariants($engine);
    }

    public function test_a_full_cycle_with_no_bets_deals_new_cards_and_carries_the_pot(): void
    {
        // Wide hands, so that the narrow-range rule stays out of the way.
        $engine = $this->game([['2H', '8C'], ['3S', '9D'], ['AD', '10S']]);
        $hands = array_column($engine->state()['players'], 'hand');

        foreach ([1, 2, 3] as $turn) {
            $this->passWholeTurn($engine);
        }

        $state = $engine->state();
        $this->assertSame(GameEngine::ROUND_SUMMARY, $state['phase']);
        $this->assertSame('no_bets', $state['lastSummary']['reason']);
        $this->assertSame(30, $state['pot']);
        $this->assertSame(0, $state['lastSummary']['cardsDrawn']);

        $engine = new GameEngine($state, GameSettings::fromArray([]), new StackedRandomizer([]), self::NOW);
        $engine->continueToNextRound();

        $this->assertSame(2, $engine->state()['round']['number']);
        $this->assertNotSame($hands, array_column($engine->state()['players'], 'hand'));
        $this->assertSame(60, $engine->state()['pot'], 'The 30 left over, plus 10 from each player.');
        $this->assertSame(980, $this->chips($engine, 1));
        $this->assertSame(2, $engine->state()['round']['startingPlayerId'], 'The start still rotates.');
        $this->assertInvariants($engine);
    }

    public function test_the_no_bets_count_starts_again_each_cycle(): void
    {
        $settings = ['maxCycles' => 0];
        $engine = $this->game([['2H', '8C'], ['3S', '9D'], ['AD', '10S']], ['KC'], $settings);

        // Cycle 1 has a bet, so it continues. Cycle 2 has none, so that one ends the round.
        $engine->placeBet(1, 10);
        $engine->pass(2);
        $engine->pass(3);
        $engine = $this->nextTurn($engine, $settings);
        $this->passWholeTurn($engine);
        $this->passWholeTurn($engine);
        $this->assertSame(2, $engine->state()['round']['cycle']);

        foreach ([1, 2, 3] as $turn) {
            $this->passWholeTurn($engine);
        }

        $this->assertSame('no_bets', $engine->state()['lastSummary']['reason']);
        $this->assertSame(2, $engine->state()['lastSummary']['cycles']);
    }

    public function test_the_no_bets_reset_can_be_turned_off(): void
    {
        $engine = $this->game([['2H', '8C'], ['3S', '9D'], ['AD', '10S']], [], ['resetOnIdleCycle' => false, 'maxCycles' => 0]);

        foreach ([1, 2, 3] as $turn) {
            $this->passWholeTurn($engine);
        }

        $this->assertSame(GameEngine::PLAYING, $engine->state()['phase']);
        $this->assertSame(2, $engine->state()['round']['cycle']);
    }

    public function test_new_cards_are_dealt_after_everyone_has_had_a_turn_by_default(): void
    {
        $engine = $this->game([['2H', '8C'], ['3S', '9D'], ['AD', '10S']], ['KC']);

        $engine->placeBet(1, 10);
        $engine->pass(2);
        $engine->pass(3);
        $engine = $this->nextTurn($engine);
        $this->passWholeTurn($engine);
        $this->passWholeTurn($engine);

        $this->assertSame('max_cycles', $engine->state()['lastSummary']['reason']);
    }

    public function test_the_owners_example_hands_are_redealt_because_most_are_narrow(): void
    {
        // A has 2-6 (gap 3), B has 5-8 (gap 2) and C has 10-K (gap 2), so two of three are narrow.
        $hands = ['2H', '6C', '5S', '8D', '10H', 'KS'];
        $wide = ['2C', '9H', '3D', '10D', 'AS', '8S'];

        $engine = GameEngine::begin(
            $this->players(3),
            GameSettings::fromArray([]),
            new StackedRandomizer([$hands, $wide], 1),
            self::NOW,
        );

        $this->assertSame(1, $engine->state()['round']['redeals']);
        $this->assertSame(['2C', '9H'], $engine->state()['players'][1]['hand']);
    }

    public function test_max_cycles_ends_the_round(): void
    {
        $engine = $this->game($this->threePlayerExample(), [], ['maxCycles' => 1, 'resetOnIdleCycle' => false]);

        foreach ([1, 2, 3] as $turn) {
            $this->passWholeTurn($engine);
        }

        $this->assertSame(GameEngine::ROUND_SUMMARY, $engine->state()['phase']);
        $this->assertSame('max_cycles', $engine->state()['lastSummary']['reason']);
    }

    public function test_narrow_majority_redeals_immediately_without_a_new_contribution(): void
    {
        $narrow = [['2H', '4C'], ['5H', '7C'], ['3H', 'KC']];
        $wide = [['AH', '5C'], ['5S', 'KD'], ['10H', 'QS']];

        $engine = GameEngine::begin(
            $this->players(3),
            GameSettings::fromArray([]),
            new StackedRandomizer([array_merge(...$narrow), array_merge(...$wide)], 1),
            self::NOW,
        );

        $this->assertSame(1, $engine->state()['round']['redeals']);
        $this->assertSame(['AH', '5C'], $engine->state()['players'][1]['hand']);
        $this->assertSame(30, $engine->state()['pot']);
        $this->assertInvariants($engine);
    }

    public function test_redeals_are_capped_so_a_narrow_table_cannot_loop(): void
    {
        $narrow = array_merge(['2H', '4C'], ['5H', '7C'], ['3H', 'KC']);

        $engine = GameEngine::begin(
            $this->players(3),
            GameSettings::fromArray([]),
            new StackedRandomizer(array_fill(0, 10, $narrow), 1),
            self::NOW,
        );

        $this->assertSame(GameEngine::MAX_REDEALS, $engine->state()['round']['redeals']);
        $this->assertSame(GameEngine::PLAYING, $engine->state()['phase']);
    }

    public function test_narrow_reset_can_wait_until_after_a_cycle(): void
    {
        $settings = ['narrowTiming' => 'after_cycle'];
        $engine = $this->game([['2H', '4C'], ['5H', '7C'], ['3H', 'KC']], [], $settings);

        $this->assertSame(GameEngine::PLAYING, $engine->state()['phase']);

        foreach ([1, 2, 3] as $turn) {
            $this->passWholeTurn($engine);
        }

        $this->assertSame('narrow_range', $engine->state()['lastSummary']['reason']);
    }

    public function test_narrow_reset_can_be_disabled(): void
    {
        $engine = $this->game([['2H', '4C'], ['5H', '7C'], ['3H', 'KC']], [], ['autoReset' => false]);

        $this->assertSame(0, $engine->state()['round']['redeals']);
    }

    public function test_no_range_hands_are_skipped(): void
    {
        $engine = $this->game([['5H', '6C'], ['7H', '7C'], ['3H', 'KC']], [], ['autoReset' => false], 1);

        $this->assertSame(3, $engine->state()['turn']['activeId']);
        $this->assertSame(2, count(array_filter($engine->events(), fn ($e) => $e['type'] === 'turn:skipped')));
    }

    public function test_no_range_hands_can_be_replaced_from_the_deck(): void
    {
        $settings = ['autoReset' => false, 'consecutiveHandling' => 'replace'];
        $engine = $this->game([['5H', '6C'], ['AS', 'KS']], ['2D', '9D'], $settings);

        $this->assertSame(1, $engine->state()['turn']['activeId']);
        $this->assertSame(['2D', '9D'], $engine->state()['players'][1]['hand']);
        $this->assertSame(['5H', '6C'], $engine->state()['discard']);
        $this->assertInvariants($engine);
    }

    public function test_winning_the_whole_pot_resets_and_everyone_contributes_again(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D']);

        $engine->placeBet(1, 10);
        $engine->placeBet(2, 20);
        $this->assertSame(0, $engine->state()['pot']);

        $engine = $this->nextTurn($engine);
        $this->assertSame(GameEngine::ROUND_SUMMARY, $engine->state()['phase']);
        $this->assertSame('pot_zero', $engine->state()['lastSummary']['reason']);

        $engine = new GameEngine($engine->state(), GameSettings::fromArray([]), new StackedRandomizer([]), self::NOW);
        $engine->continueToNextRound();

        $this->assertSame(30, $engine->state()['pot']);
        $this->assertSame(2, $engine->state()['round']['number']);
        $this->assertSame(990, $this->chips($engine, 1));
        $this->assertInvariants($engine);
    }

    public function test_a_shrinking_pot_alone_does_not_reset(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['3D']);

        $engine->placeBet(1, 10);
        $engine->pass(2);
        $engine->pass(3);
        $this->assertSame(20, $engine->state()['pot']);

        $engine = $this->nextTurn($engine);

        $this->assertSame(GameEngine::PLAYING, $engine->state()['phase']);
        $this->assertSame(1, $engine->state()['round']['number']);
    }

    public function test_starting_player_rotates_clockwise_between_rounds(): void
    {
        $engine = $this->game($this->threePlayerExample(), [], ['maxCycles' => 1], 2);
        $this->assertSame(2, $engine->state()['round']['startingPlayerId']);
        $this->assertSame(1, $engine->state()['round']['dealerId']);

        foreach ([1, 2, 3] as $turn) {
            $this->passWholeTurn($engine);
        }

        $engine->continueToNextRound();

        $this->assertSame(3, $engine->state()['round']['startingPlayerId']);
        $this->assertSame(2, $engine->state()['round']['dealerId']);
    }

    public function test_deck_exhaustion_resets_the_round(): void
    {
        $engine = $this->game([['AH', 'KC'], ['AS', 'KD']], [], ['autoReset' => false]);
        $state = $engine->state();
        $state['discard'] = [...$state['discard'], ...array_slice($state['deck'], 1)];
        $state['deck'] = array_slice($state['deck'], 0, 1);
        $engine = new GameEngine($state, GameSettings::fromArray(['autoReset' => false]), new StackedRandomizer([]), self::NOW);

        $engine->placeBet(1, 10);
        $engine->pass(2);

        $engine = $this->nextTurn($engine, ['autoReset' => false]);

        $this->assertSame('deck_empty', $engine->state()['lastSummary']['reason']);
    }

    public function test_deck_can_reshuffle_used_cards_instead_of_resetting(): void
    {
        $settings = ['autoReset' => false, 'deckEmptyRule' => 'reshuffle'];
        $engine = $this->game([['AH', 'KC'], ['AS', 'KD']], [], $settings);
        $state = $engine->state();
        $state['discard'] = [...$state['discard'], ...array_slice($state['deck'], 1)];
        $state['deck'] = array_slice($state['deck'], 0, 1);
        $engine = new GameEngine($state, GameSettings::fromArray($settings), new StackedRandomizer([]), self::NOW);

        $engine->placeBet(1, 10);
        $engine->pass(2);

        $engine = $this->nextTurn($engine, $settings);

        $this->assertSame(GameEngine::PLAYING, $engine->state()['phase']);
        $this->assertCount(48, $engine->state()['deck']);
        $this->assertInvariants($engine);
    }

    public function test_no_valid_predictions_resets_the_round(): void
    {
        $engine = $this->game([['AH', 'KC'], ['AS', 'KD']], [], ['autoReset' => false]);
        $state = $engine->state();
        $state['players'][1]['hand'] = ['AH', '2C'];
        $state['players'][2]['hand'] = ['AS', '2D'];
        $engine = new GameEngine($state, GameSettings::fromArray(['autoReset' => false]), new StackedRandomizer([]), self::NOW);

        $engine->pass(1);
        $engine->pass(2);

        $this->assertSame('no_valid_predictions', $engine->state()['lastSummary']['reason']);
    }

    public function test_manual_reset_is_immediate_when_no_bets_exist(): void
    {
        $engine = $this->game($this->threePlayerExample());

        $engine->requestReset();

        $this->assertSame('manual', $engine->state()['lastSummary']['reason']);
    }

    public function test_manual_reset_settles_committed_bets_first(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['9D']);
        $engine->placeBet(1, 10);

        $engine->requestReset();

        $this->assertSame(0, $engine->state()['escrow']);
        $this->assertSame(40, $engine->state()['pot']);
        $this->assertSame('reveal', $engine->state()['turn']['stage']);

        $engine = $this->nextTurn($engine);
        $this->assertSame('manual', $engine->state()['lastSummary']['reason']);
    }

    public function test_manual_reset_can_be_disabled(): void
    {
        $engine = $this->game($this->threePlayerExample(), [], ['allowManualReset' => false]);

        $this->expectException(GameRuleException::class);
        $engine->requestReset();
    }

    public function test_round_summary_reports_the_round(): void
    {
        $settings = ['maxCycles' => 1];
        $engine = $this->game($this->threePlayerExample(), ['9D'], $settings);
        $engine->placeBet(1, 10);
        $engine->placeBet(2, 20);
        $engine = $this->nextTurn($engine, $settings);

        $this->passWholeTurn($engine);
        $this->passWholeTurn($engine);

        $summary = $engine->state()['lastSummary'];
        $this->assertSame(30, $summary['startingPot']);
        $this->assertSame(60, $summary['endingPot']);
        $this->assertSame(30, $summary['losingBets']);
        $this->assertSame(0, $summary['winningBets']);
        $this->assertSame(1, $summary['cardsDrawn']);
        $this->assertSame(20, $summary['players'][1]['lost']);
    }

    public function test_summary_advances_automatically_after_its_deadline(): void
    {
        $settings = ['maxCycles' => 1];
        $engine = $this->game($this->threePlayerExample(), [], $settings);

        foreach ([1, 2, 3] as $turn) {
            $this->passWholeTurn($engine);
        }

        $engine = $this->later($engine, $settings);
        $this->assertTrue($engine->tick());
        $this->assertSame(2, $engine->state()['round']['number']);
    }

    public function test_players_who_cannot_pay_sit_out_the_round(): void
    {
        $settings = ['startingChips' => 100, 'contribution' => 10];
        $engine = $this->game($this->threePlayerExample(), ['3D'], $settings);
        $state = $engine->state();
        $state['players'][3]['chips'] = 5;
        $state['pot'] = 0;
        $state['issued'] = 90 + 90 + 5;
        $state['turn'] = null;
        $state['phase'] = GameEngine::ROUND_SUMMARY;

        $engine = new GameEngine($state, GameSettings::fromArray($settings), new StackedRandomizer([]), self::NOW);
        $engine->continueToNextRound();

        $this->assertSame('sitting_out', $engine->state()['players'][3]['status']);
        $this->assertNull($engine->state()['players'][3]['hand']);
        $this->assertSame(20, $engine->state()['pot']);
        $this->assertSame([2, 1], $engine->state()['round']['order'], 'The start rotates from Player 1 to Player 2.');
        $this->assertInvariants($engine);
    }

    public function test_game_ends_when_too_few_players_can_pay_and_any_pot_is_split(): void
    {
        $settings = ['startingChips' => 100, 'contribution' => 10];
        $engine = $this->game($this->threePlayerExample(), [], $settings);
        $state = $engine->state();
        $state['issued'] = 5 + 5 + 100;
        $state['players'][1]['chips'] = 5;
        $state['players'][2]['chips'] = 5;
        $state['players'][3]['chips'] = 100;
        $state['pot'] = 0;
        $state['turn'] = null;
        $state['phase'] = GameEngine::ROUND_SUMMARY;

        $engine = new GameEngine($state, GameSettings::fromArray($settings), new StackedRandomizer([]), self::NOW);
        $engine->continueToNextRound();

        $this->assertSame(GameEngine::FINISHED, $engine->state()['phase']);
        $this->assertSame('not_enough_players', $engine->state()['final']['reason']);
        $this->assertInvariants($engine);
    }

    public function test_host_ending_the_game_refunds_open_bets_and_splits_the_pot(): void
    {
        $engine = $this->game($this->threePlayerExample());
        $engine->placeBet(1, 10);

        $engine->endGame();

        $this->assertSame(GameEngine::FINISHED, $engine->state()['phase']);
        $this->assertSame(0, $engine->state()['escrow']);
        $this->assertSame(0, $engine->state()['pot']);
        $this->assertSame(1000, $this->chips($engine, 1));
        $this->assertSame(1000, $this->chips($engine, 3));
        $this->assertSame(10, $engine->state()['final']['share']);
        $this->assertInvariants($engine);
    }

    public function test_an_indivisible_pot_remainder_stays_in_the_pot(): void
    {
        $engine = $this->game($this->threePlayerExample(), [], ['potSeed' => 1]);

        $engine->endGame();

        $this->assertSame(1, $engine->state()['pot']);
        $this->assertInvariants($engine);
    }

    public function test_a_table_where_nobody_can_ever_bet_ends_the_round_instead_of_looping(): void
    {
        $settings = ['allowSelfBet' => false];
        $engine = $this->game($this->threePlayerExample(), [], $settings);
        $state = $engine->state();
        $state['players'][2]['status'] = 'sitting_out';
        $state['players'][2]['hand'] = null;
        $state['players'][3]['status'] = 'sitting_out';
        $state['players'][3]['hand'] = null;
        $state['turn']['stage'] = 'reveal';
        $state['deadline'] = self::NOW;

        $engine = new GameEngine($state, GameSettings::fromArray($settings), new StackedRandomizer([]), self::NOW);
        $engine->tick();

        $this->assertSame('no_eligible_bettors', $engine->state()['lastSummary']['reason']);
    }

    public function test_player_leaving_during_their_invite_counts_as_declining(): void
    {
        $engine = $this->game($this->threePlayerExample());
        $engine->placeBet(1, 10);

        $engine->removePlayer(2);

        $this->assertSame(3, $engine->currentActor());
    }

    public function test_players_who_left_lose_their_turns_but_their_bets_settle(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['KC']);
        $engine->placeBet(1, 10);
        $engine->placeBet(2, 10);

        $engine->removePlayer(2);
        $engine->pass(3);

        $this->assertSame(50, $engine->state()['pot']);
        $engine = $this->nextTurn($engine);
        $this->assertSame(3, $engine->state()['turn']['activeId']);
    }

    public function test_game_finishes_when_only_one_player_remains(): void
    {
        $engine = $this->game([['AH', 'KC'], ['AS', 'KD']]);
        $engine->placeBet(1, 10);

        $engine->removePlayer(2);

        $this->assertSame(GameEngine::FINISHED, $engine->state()['phase']);
        $this->assertSame('not_enough_players', $engine->state()['final']['reason']);
        $this->assertInvariants($engine);
    }

    public function test_offline_player_is_passed_only_when_it_is_their_action(): void
    {
        $engine = $this->game($this->threePlayerExample());

        $this->assertFalse($engine->passOffline(2));
        $this->assertTrue($engine->passOffline(1));
        $this->assertSame(2, $engine->currentActor());
    }

    public function test_late_player_pays_in_and_gets_cards_at_the_next_deal(): void
    {
        $settings = ['allowLateJoin' => true, 'maxCycles' => 1];
        $engine = $this->game($this->threePlayerExample(), [], $settings);

        $engine->addLatePlayer(4, 'Player 4');

        $this->assertSame('waiting', $engine->state()['players'][4]['status']);
        $this->assertNull($engine->state()['players'][4]['hand']);
        $this->assertSame(40, $engine->state()['pot']);

        foreach ([1, 2, 3] as $turn) {
            $this->passWholeTurn($engine);
        }

        $engine->continueToNextRound();

        $this->assertSame('playing', $engine->state()['players'][4]['status']);
        $this->assertCount(2, $engine->state()['players'][4]['hand']);
        $this->assertInvariants($engine);
    }

    public function test_late_join_is_rejected_unless_enabled(): void
    {
        $engine = $this->game($this->threePlayerExample());

        $this->expectException(GameRuleException::class);
        $engine->addLatePlayer(4, 'Player 4');
    }

    public function test_view_never_exposes_the_deck(): void
    {
        $engine = $this->game($this->threePlayerExample(), ['9D']);
        $view = StateView::forViewer($engine->state(), GameSettings::fromArray([]), 2, self::NOW);

        $this->assertArrayNotHasKey('deck', $view);
        $this->assertArrayNotHasKey('discard', $view);
        $this->assertSame(46, $view['deckCount']);
        $this->assertStringNotContainsString('"9D"', json_encode($view));
    }

    public function test_view_shows_all_hands_in_open_rooms(): void
    {
        $engine = $this->game($this->threePlayerExample());
        $view = StateView::forViewer($engine->state(), GameSettings::fromArray([]), 2, self::NOW);

        $this->assertSame(['10H', 'QS'], $view['players'][2]['hand']);
    }

    public function test_view_hides_other_hands_until_their_turn_in_hidden_rooms(): void
    {
        $settings = ['cardVisibility' => 'hidden'];
        $engine = $this->game($this->threePlayerExample(), [], $settings);
        $view = StateView::forViewer($engine->state(), GameSettings::fromArray($settings), 2, self::NOW);

        $this->assertSame(['AH', '5C'], $view['players'][0]['hand'], 'The active player is visible.');
        $this->assertSame(['5S', 'KD'], $view['players'][1]['hand'], 'Your own hand is visible.');
        $this->assertNull($view['players'][2]['hand'], 'Other hands are hidden.');
        $this->assertTrue($view['players'][2]['hasHand']);
        $this->assertStringNotContainsString('"QS"', json_encode($view));
    }

    public function test_view_limits_appear_only_for_the_player_who_must_act(): void
    {
        $engine = $this->game($this->threePlayerExample());
        $settings = GameSettings::fromArray([]);

        $this->assertTrue(StateView::forViewer($engine->state(), $settings, 1, self::NOW)['you']['mustAct']);
        $this->assertSame(30, StateView::forViewer($engine->state(), $settings, 1, self::NOW)['you']['limits']['max']);
        $this->assertFalse(StateView::forViewer($engine->state(), $settings, 2, self::NOW)['you']['mustAct']);
        $this->assertNull(StateView::forViewer($engine->state(), $settings, 2, self::NOW)['you']['limits']);
    }

    private function players(int $count): array
    {
        return array_map(fn (int $id) => ['id' => $id, 'name' => "Player {$id}"], range(1, $count));
    }

    private function passWholeTurn(GameEngine $engine): void
    {
        $turnNumber = $engine->state()['turn']['number'];

        while (($engine->state()['turn']['number'] ?? null) === $turnNumber) {
            $engine->pass($engine->currentActor());
        }
    }
}
