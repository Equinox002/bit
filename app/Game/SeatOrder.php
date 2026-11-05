<?php

namespace App\Game;

/**
 * Seats are listed clockwise. Turn order always follows seating, never the result of a turn.
 */
final class SeatOrder
{
    /**
     * Every seat after $id, in clockwise order, ending with $id itself.
     *
     * @param  list<int>  $seats
     * @return list<int>
     */
    public static function clockwiseAfter(array $seats, int $id): array
    {
        $index = array_search($id, $seats, true);

        if ($index === false) {
            return $seats;
        }

        return [...array_slice($seats, $index + 1), ...array_slice($seats, 0, $index + 1)];
    }

    /**
     * @param  list<int>  $seats
     * @param  list<int>  $among
     */
    public static function nextAfter(array $seats, int $id, array $among): ?int
    {
        foreach (self::clockwiseAfter($seats, $id) as $candidate) {
            if (in_array($candidate, $among, true)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * @param  list<int>  $seats
     * @param  list<int>  $among
     * @return list<int> The players in $among, in clockwise order, starting with $start.
     */
    public static function startingFrom(array $seats, int $start, array $among): array
    {
        $ordered = [$start];

        foreach (self::clockwiseAfter($seats, $start) as $candidate) {
            if ($candidate !== $start && in_array($candidate, $among, true)) {
                $ordered[] = $candidate;
            }
        }

        return $ordered;
    }
}
