import { useLayoutEffect, useRef, useState } from 'react';

const SMALL_SCREEN = 640;

const SIZES = {
    regular: { small: { width: 84, height: 106 }, large: { width: 128, height: 112 } },
    compact: { small: { width: 68, height: 50 }, large: { width: 112, height: 54 } },
};

// The middle of the table, which seats and chips must not cover: the narrower pot above the wider
// cards, as offsets from the table's centre.
const CENTER = {
    small: [{ y: 28, width: 190, height: 120 }, { y: -62, width: 130, height: 52 }],
    large: [{ y: 36, width: 300, height: 172 }, { y: -84, width: 220, height: 68 }],
};

// A bet on the felt: a stack with its amount, or just the stack beside a compact seat.
const BETS = {
    regular: { small: { width: 56, height: 50 }, large: { width: 84, height: 68 } },
    compact: { small: { width: 26, height: 28 }, large: { width: 38, height: 40 } },
};

const GAP = 4;

function overlaps(a, b) {
    return Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
}

function seatsFit(width, height, count, seat, center) {
    const radiusX = width / 2 - seat.width / 2;
    const radiusY = height / 2 - seat.height / 2;
    const seats = Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * 2 * Math.PI;

        return { x: radiusX * Math.sin(angle), y: radiusY * Math.cos(angle), ...seat };
    });

    return seats.every((current, index) => {
        const next = seats[(index + 1) % count];

        return !center.some((part) => overlaps(current, { x: 0, ...part })) && (count < 2 || !overlaps(current, next));
    });
}

/**
 * Where a seat's chips travel: the seat, the table's middle, and the bet's place on the felt, in
 * pixels from the table's corner. The bet goes just inside the seat, towards the middle of the
 * table, and slides sideways if that would put it on top of the pot or cards.
 */
function chipSpot(angle, { width, height, seat, center, bet }) {
    const middle = { x: width / 2, y: height / 2 };
    const at = {
        x: middle.x - Math.sin(angle) * (middle.x - seat.width / 2 - 2),
        y: middle.y + Math.cos(angle) * (middle.y - seat.height / 2 - 2),
    };
    const dx = middle.x - at.x;
    const dy = middle.y - at.y;
    const reachX = (seat.width / 2 + bet.width / 2 + GAP) / Math.max(Math.abs(dx), 1);
    const reachY = (seat.height / 2 + bet.height / 2 + GAP) / Math.max(Math.abs(dy), 1);
    const reach = Math.min(1, reachX, reachY);
    const spot = { x: at.x + dx * reach, y: at.y + dy * reach };

    center.forEach((part) => {
        const partY = middle.y + part.y;
        const clearX = (part.width + bet.width) / 2 - Math.abs(spot.x - middle.x);
        const clearY = (part.height + bet.height) / 2 - Math.abs(spot.y - partY);

        if (clearX > 0 && clearY > 0) {
            // Always outwards from the table's centre, so clearing the pot can't land it on the cards.
            if (reachX <= reachY) {
                spot.y = spot.y < middle.y
                    ? partY - (part.height + bet.height) / 2
                    : partY + (part.height + bet.height) / 2;
            } else {
                spot.x += (spot.x < middle.x ? -1 : 1) * clearX;
            }
        }
    });

    return { seat: at, middle, bet: spot };
}

/**
 * Measures the table and picks a seat size that fits. The space changes with the screen, the
 * number of players and how tall the betting panel currently is, so CSS alone can't decide it.
 */
export default function useSeatLayout(count) {
    const ref = useRef(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        const element = ref.current;

        if (!element) {
            return undefined;
        }

        const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    const bucket = size.width < SMALL_SCREEN ? 'small' : 'large';
    const compact = !seatsFit(size.width, size.height, count, SIZES.regular[bucket], CENTER[bucket]);
    const kind = compact ? 'compact' : 'regular';
    const seat = SIZES[kind][bucket];

    return {
        ref,
        compact,
        large: bucket === 'large',
        ready: size.width > 0,
        spotFor: (angle) => chipSpot(angle, { ...size, seat, center: CENTER[bucket], bet: BETS[kind][bucket] }),
        style: {
            '--seat-x': `${seat.width / 2 + 2}px`,
            '--seat-y': `${seat.height / 2 + 2}px`,
        },
    };
}
