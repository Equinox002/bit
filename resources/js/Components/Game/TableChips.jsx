import { motion } from 'framer-motion';
import { ChipStack } from '@/Components/Game/PokerChip';
import { chips } from '@/game/format';

// The drawn card turns over first, then the chips move.
const SETTLE_DELAY = 0.85;
const SETTLE_TIME = 0.55;

const stackSize = (large, compact) => (large ? (compact ? 26 : 38) : (compact ? 20 : 27));

function AmountTag({ amount, ghost }) {
    return (
        <div className={`mt-0.5 whitespace-nowrap rounded-full px-1.5 text-[10px] font-bold leading-[15px] tabular-nums shadow-card sm:px-2 sm:text-xs sm:leading-[18px] ${
            ghost ? 'border border-dashed border-gold-300/70 bg-ink-950/70 text-gold-200' : 'bg-ink-950/90 text-gold-300'
        }`}>
            {chips(amount)}
        </div>
    );
}

/**
 * A bet on the felt. It slides out from the player's seat, then after the draw it goes back to the
 * seat if it won or into the pot if it lost. A winner's profit arrives from the pot at the same time.
 */
function BetStack({ spot, amount, outcome, playerName, compact, large }) {
    const toSeat = { x: spot.seat.x - spot.bet.x, y: spot.seat.y - spot.bet.y };
    const toPot = { x: spot.middle.x - spot.bet.x, y: spot.middle.y - spot.bet.y };
    const size = stackSize(large, compact);
    const columns = compact ? 1 : 2;

    const animate = outcome
        ? {
            ...(outcome.won ? toSeat : toPot),
            opacity: [1, 1, 0],
            scale: 0.75,
            transition: { delay: SETTLE_DELAY, duration: SETTLE_TIME, ease: 'easeIn' },
        }
        : { x: 0, y: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 240, damping: 24 } };

    return (
        <div className="pointer-events-none absolute z-[5] -translate-x-1/2 -translate-y-1/2" style={{ left: spot.bet.x, top: spot.bet.y }}>
            <motion.div
                data-testid={`bet-${playerName}`}
                className="flex flex-col items-center"
                initial={{ ...toSeat, opacity: 0, scale: 0.7 }}
                animate={animate}
            >
                <ChipStack amount={amount} size={size} maxColumns={columns} maxPerColumn={compact ? 3 : 5} />
                {!compact && !outcome && <AmountTag amount={amount} />}
            </motion.div>

            {outcome?.won && outcome.profit > 0 && (
                <motion.div
                    data-testid="payout"
                    className="absolute left-1/2 top-1/2 -ml-3 -mt-3"
                    initial={{ ...toPot, opacity: 0, scale: 0.8 }}
                    animate={{ ...toSeat, opacity: [0, 1, 1, 0], scale: 0.75 }}
                    transition={{ delay: SETTLE_DELAY, duration: SETTLE_TIME + 0.2, ease: 'easeInOut' }}
                >
                    <ChipStack amount={outcome.profit} size={size} maxColumns={columns} maxPerColumn={compact ? 3 : 5} />
                </motion.div>
            )}
        </div>
    );
}

/**
 * What the current player is about to bet, before they commit to it.
 */
function BetPreview({ spot, amount, compact, large }) {
    return (
        <div className="pointer-events-none absolute z-[5] -translate-x-1/2 -translate-y-1/2 opacity-80" style={{ left: spot.bet.x, top: spot.bet.y }}>
            <motion.div
                key={amount}
                data-testid="bet-preview"
                className="flex flex-col items-center"
                initial={{ scale: 0.82, y: -6 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 20 }}
            >
                <ChipStack amount={amount} size={stackSize(large, compact)} maxColumns={compact ? 1 : 2} maxPerColumn={compact ? 3 : 5} />
                {!compact && <AmountTag amount={amount} ghost />}
            </motion.div>
        </div>
    );
}

export default function TableChips({ game, revealing, spots, nameOf, compact, large, preview }) {
    const { turn, lastResult } = game;

    if (!turn) {
        return null;
    }

    const actorId = turn.stage === 'own_bet' ? turn.activeId : turn.askedId;
    const bets = revealing
        ? lastResult.outcomes.map((outcome) => ({ playerId: outcome.playerId, amount: outcome.stake, outcome }))
        : turn.bets;

    return (
        <>
            {bets.map(({ playerId, amount, outcome }) => spots[playerId] && (
                <BetStack
                    key={`${turn.number}-${playerId}`}
                    spot={spots[playerId]}
                    amount={amount}
                    outcome={outcome}
                    playerName={nameOf(playerId)}
                    compact={compact}
                    large={large}
                />
            ))}
            {preview > 0 && spots[actorId] && !revealing && (
                <BetPreview spot={spots[actorId]} amount={preview} compact={compact} large={large} />
            )}
        </>
    );
}
