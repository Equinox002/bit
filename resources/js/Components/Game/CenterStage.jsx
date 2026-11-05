import { AnimatePresence, motion } from 'framer-motion';
import PlayingCard, { CardBack, RevealedCard } from '@/Components/Game/PlayingCard';
import { ChipStack } from '@/Components/Game/PokerChip';
import { RANKS, cardValue, winningValues } from '@/game/engine/rules';
import { chips } from '@/game/format';

function Pot({ pot, committed, large }) {
    return (
        <div className="flex items-end justify-center gap-2 sm:gap-3">
            <ChipStack data-testid="pot-chips" amount={pot} spread={3} size={large ? 42 : 30} maxColumns={large ? 4 : 3} maxPerColumn={large ? 6 : 4} />
            <div className="text-left">
                <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-300/80 sm:text-xs">Pot</div>
                <motion.div
                    key={pot}
                    data-testid="pot"
                    initial={{ scale: 1.18 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.35 }}
                    className="origin-left font-display text-3xl font-bold leading-none tabular-nums lining-nums text-gold-300 sm:text-5xl short:!text-3xl"
                >
                    {chips(pot)}
                </motion.div>
                {committed > 0 && <div className="mt-0.5 whitespace-nowrap text-[11px] text-ivory-200 sm:text-sm">{chips(committed)} in bets</div>}
            </div>
        </div>
    );
}

/**
 * Every rank in order, with the winning ones lit, so nobody has to work the range out. Display
 * only: the server decides what actually wins.
 */
function RankLadder({ cards, drawn, settings }) {
    const wins = winningValues(cards[0], cards[1], settings);
    const edges = cards.map((card) => cardValue(card, settings.aceHigh));
    const ranks = settings.aceHigh ? [...RANKS.slice(1), RANKS[0]] : RANKS;
    const drawnValue = drawn ? cardValue(drawn, settings.aceHigh) : null;

    return (
        <ol aria-hidden="true" data-testid="rank-ladder" className="flex gap-px">
            {ranks.map((rank) => {
                const value = cardValue(`${rank}H`, settings.aceHigh);
                const winning = wins.includes(value);
                const tone = value === drawnValue
                    ? (winning ? 'bg-win-400 text-ink-950 ring-1 ring-white' : 'bg-loss-400 text-ink-950 ring-1 ring-white')
                    : winning
                        ? 'bg-gold-400/90 text-ink-950'
                        : edges.includes(value)
                            ? 'bg-ivory-50/20 text-ivory-50'
                            : 'bg-black/30 text-ivory-300/70';

                return (
                    <li key={rank} className={`flex h-4 w-[13.5px] items-center justify-center rounded-sm text-[8px] font-bold leading-none sm:h-5 sm:w-5 sm:text-[10px] short:!h-4 short:!w-[13.5px] short:!text-[8px] ${tone}`}>
                        {rank}
                    </li>
                );
            })}
        </ol>
    );
}

/**
 * The middle of the table: the pot, the active player's range, and the reveal.
 */
export default function CenterStage({ game, nameOf, youId, settings, large }) {
    const { turn, pot, committed, lastResult } = game;
    const result = turn?.stage === 'reveal' && lastResult?.turnNumber === turn.number ? lastResult : null;
    const activeName = turn ? (turn.activeId === youId ? 'You' : nameOf(turn.activeId)) : null;

    return (
        <div className="flex flex-col items-center gap-1 sm:gap-2">
            <Pot pot={pot} committed={result ? 0 : committed} large={large} />

            {turn && (
                <>
                    <div data-testid="center-cards" className="flex items-center gap-1.5 sm:gap-3">
                        <PlayingCard card={turn.cards[0]} size="md" />
                        <div className="relative">
                            {result ? (
                                <RevealedCard
                                    key={result.turnNumber}
                                    card={result.drawn}
                                    size="md"
                                    className={result.won ? 'ring-2 ring-win-400 sm:ring-4' : 'ring-2 ring-loss-400 sm:ring-4'}
                                />
                            ) : (
                                <CardBack size="md" />
                            )}
                        </div>
                        <PlayingCard card={turn.cards[1]} size="md" />
                    </div>

                    <RankLadder cards={turn.cards} drawn={result?.drawn} settings={settings} />

                    <AnimatePresence mode="wait">
                        {result ? (
                            <motion.div
                                key="result"
                                data-testid="result-banner"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                                className={`rounded-full px-3 py-0.5 text-xs font-bold shadow-card sm:text-base ${
                                    result.won ? 'bg-win-600 text-white' : 'bg-loss-600 text-white'
                                }`}
                            >
                                {result.won ? 'In range. Winners paid!' : 'Out of range. Bets go to the pot.'}
                            </motion.div>
                        ) : (
                            <motion.div key="range" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-[220px] truncate text-center text-xs text-ivory-100 sm:max-w-none sm:text-base">
                                <span className="font-semibold">{activeName}</span>{' '}
                                {turn.activeId === youId ? 'are' : 'is'} playing{' '}
                                <span data-testid="range" className="font-bold text-gold-300">{turn.rangeLabel}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </div>
    );
}
