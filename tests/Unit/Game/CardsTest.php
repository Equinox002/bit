<?php

namespace Tests\Unit\Game;

use App\Game\Card;
use App\Game\CardRange;
use App\Game\Deck;
use App\Game\GameSettings;
use App\Game\ResetPolicy;
use App\Game\SeatOrder;
use App\Game\SecureRandomizer;
use PHPUnit\Framework\TestCase;

class CardsTest extends TestCase
{
    public function test_standard_deck_has_52_unique_cards(): void
    {
        $deck = Deck::standard();

        $this->assertCount(52, $deck);
        $this->assertCount(52, array_unique($deck));

        foreach (Card::SUITS as $suit) {
            $this->assertCount(13, array_filter($deck, fn ($card) => Card::suit($card) === $suit));
        }
    }

    public function test_shuffling_keeps_every_card_and_changes_the_order(): void
    {
        $randomizer = new SecureRandomizer();
        $first = Deck::shuffled($randomizer);
        $second = Deck::shuffled($randomizer);

        $sorted = $first;
        sort($sorted);
        $expected = Deck::standard();
        sort($expected);

        $this->assertSame($expected, $sorted);
        $this->assertNotSame(Deck::standard(), $first);
        $this->assertNotSame($first, $second);
    }

    public function test_shuffling_is_not_visibly_biased(): void
    {
        $randomizer = new SecureRandomizer();
        $firstCardCounts = [];
        $runs = 5200;

        for ($i = 0; $i < $runs; $i++) {
            $card = Deck::shuffled($randomizer)[0];
            $firstCardCounts[$card] = ($firstCardCounts[$card] ?? 0) + 1;
        }

        // Each card expects 100 appearances, so these bounds are many standard deviations wide.
        $this->assertCount(52, $firstCardCounts);
        $this->assertGreaterThan(40, min($firstCardCounts));
        $this->assertLessThan(180, max($firstCardCounts));
    }

    public function test_ace_is_low_by_default_and_can_be_high(): void
    {
        $this->assertSame(1, Card::value('AH'));
        $this->assertSame(14, Card::value('AH', true));
        $this->assertSame(10, Card::value('10S'));
        $this->assertSame(13, Card::value('KD', true));
    }

    public function test_spec_example_range_of_a_and_5_is_2_3_4(): void
    {
        $settings = GameSettings::fromArray([]);

        $this->assertSame([2, 3, 4], CardRange::winningValues('AH', '5C', $settings));
        $this->assertTrue(CardRange::wins('3D', 'AH', '5C', $settings));
        $this->assertFalse(CardRange::wins('9D', 'AH', '5C', $settings));
    }

    public function test_range_is_the_same_in_either_card_order_and_ignores_suits(): void
    {
        $settings = GameSettings::fromArray([]);

        $this->assertSame(
            CardRange::winningValues('AH', '5C', $settings),
            CardRange::winningValues('5S', 'AD', $settings),
        );
        $this->assertSame('A–5', CardRange::label('5S', 'AD', $settings));
    }

    public function test_boundaries_lose_by_default_and_win_when_inclusive(): void
    {
        $strict = GameSettings::fromArray([]);
        $inclusive = GameSettings::fromArray(['inclusiveBoundaries' => true]);

        $this->assertFalse(CardRange::wins('AS', 'AH', '5C', $strict));
        $this->assertFalse(CardRange::wins('5D', 'AH', '5C', $strict));
        $this->assertTrue(CardRange::wins('AS', 'AH', '5C', $inclusive));
        $this->assertTrue(CardRange::wins('5D', 'AH', '5C', $inclusive));
    }

    public function test_ace_high_changes_the_range(): void
    {
        $settings = GameSettings::fromArray(['aceHigh' => true]);

        $this->assertSame([6, 7, 8, 9, 10, 11, 12, 13], CardRange::winningValues('AH', '5C', $settings));
        $this->assertFalse(CardRange::wins('3D', 'AH', '5C', $settings));
        $this->assertTrue(CardRange::wins('KD', 'AH', '5C', $settings));
    }

    public function test_consecutive_cards_have_no_range_unless_inclusive(): void
    {
        $this->assertSame([], CardRange::winningValues('5H', '6C', GameSettings::fromArray([])));
        $this->assertSame([5, 6], CardRange::winningValues('5H', '6C', GameSettings::fromArray(['inclusiveBoundaries' => true])));
    }

    public function test_identical_cards_have_no_range_unless_inclusive(): void
    {
        $this->assertSame([], CardRange::winningValues('7H', '7C', GameSettings::fromArray([])));
        $this->assertSame([7], CardRange::winningValues('7H', '7C', GameSettings::fromArray(['inclusiveBoundaries' => true])));
    }

    public function test_gaps_match_the_spec_examples(): void
    {
        $settings = GameSettings::fromArray([]);

        $this->assertSame(1, CardRange::gap('2H', '4C', $settings));
        $this->assertSame(1, CardRange::gap('5H', '7C', $settings));
        $this->assertSame(9, CardRange::gap('3H', 'KC', $settings));
    }

    public function test_clockwise_order_wraps_around_the_table(): void
    {
        $this->assertSame([3, 1, 2], SeatOrder::clockwiseAfter([1, 2, 3], 2));
        $this->assertSame(1, SeatOrder::nextAfter([1, 2, 3], 3, [1, 2, 3]));
        $this->assertSame(3, SeatOrder::nextAfter([1, 2, 3], 1, [1, 3]));
        $this->assertSame([2, 3, 1], SeatOrder::startingFrom([1, 2, 3], 2, [1, 2, 3]));
    }

    public function test_narrow_range_thresholds_all_apply(): void
    {
        $hands = [['2H', '4C'], ['5H', '7C'], ['3H', 'KC']];

        $this->assertTrue(ResetPolicy::narrowRangeTriggered($hands, GameSettings::fromArray([])));
        $this->assertFalse(ResetPolicy::narrowRangeTriggered($hands, GameSettings::fromArray(['narrowMinPlayers' => 3])));
        $this->assertFalse(ResetPolicy::narrowRangeTriggered($hands, GameSettings::fromArray(['narrowPercent' => 70])));
        $this->assertFalse(ResetPolicy::narrowRangeTriggered($hands, GameSettings::fromArray(['narrowMaxGap' => 0])));
        $this->assertFalse(ResetPolicy::narrowRangeTriggered($hands, GameSettings::fromArray(['autoReset' => false])));
    }

    public function test_no_valid_predictions_when_the_deck_cannot_satisfy_any_hand(): void
    {
        $settings = GameSettings::fromArray([]);

        $this->assertTrue(ResetPolicy::noValidPredictions([['AH', '3C']], ['KD', '9S'], $settings));
        $this->assertFalse(ResetPolicy::noValidPredictions([['AH', '3C']], ['KD', '2S'], $settings));
    }
}
