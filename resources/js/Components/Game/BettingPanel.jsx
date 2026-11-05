import { motion } from 'framer-motion';
import { Clock, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PokerChip } from '@/Components/Game/PokerChip';
import { Button } from '@/Components/Game/ui';
import { rackChips } from '@/game/chips';
import { chips } from '@/game/format';
import useCountdown from '@/game/useCountdown';

function Timer({ seconds, total }) {
    if (seconds === null) {
        return null;
    }

    return (
        <div className="flex items-center gap-1.5 text-xs tabular-nums text-ivory-300">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span className={seconds <= 5 ? 'font-bold text-loss-300' : ''}>{seconds}s</span>
            <span className="sr-only">remaining</span>
            <div className="hidden h-1 w-20 overflow-hidden rounded-full bg-ink-700 sm:block" aria-hidden="true">
                <div className={`h-full transition-all duration-300 ${seconds <= 5 ? 'bg-loss-400' : 'bg-gold-400'}`} style={{ width: `${Math.min(100, (seconds / total) * 100)}%` }} />
            </div>
        </div>
    );
}

/**
 * Tapping a chip adds it to the bet, like pushing chips forward at a real table. Min, Half and Max
 * set the amount directly, so a bet can always be corrected.
 */
function AmountPicker({ limits, amount, setAmount, showCustom, customClass = '' }) {
    const half = Math.max(limits.min, Math.floor(limits.max / 2));
    const quick = [...new Set([limits.min, half, limits.max])];
    const invalid = !Number.isInteger(amount) || amount < limits.min || amount > limits.max;
    const rack = limits.max > limits.min ? rackChips(limits) : [];
    const current = Number.isInteger(amount) ? amount : 0;

    return (
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="flex items-center gap-2 lg:min-w-0 lg:flex-1 short:flex-col short:items-stretch">
                {rack.length > 0 && (
                    <div role="group" aria-label="Add chips to your bet" className="flex shrink-0 gap-1 short:justify-center">
                        {rack.map((chip) => (
                            <motion.button
                                key={chip.value}
                                type="button"
                                data-testid={`add-chip-${chip.value}`}
                                aria-label={`Add ${chips(chip.value)}`}
                                disabled={current + chip.value > limits.max}
                                onClick={() => setAmount(current + chip.value)}
                                whileTap={{ scale: 0.86, y: -3 }}
                                className="rounded-full shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-200 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                <PokerChip chip={chip} className="h-11 w-11 sm:h-12 sm:w-12" />
                            </motion.button>
                        ))}
                    </div>
                )}
                <div className="flex min-w-0 flex-1 gap-1">
                    {quick.map((value, index) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setAmount(value)}
                            className={`min-h-11 min-w-0 flex-1 rounded-xl border px-0.5 text-xs font-semibold tabular-nums transition sm:text-sm ${
                                amount === value ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-white/10 bg-ink-800 text-ivory-100 hover:border-white/25'
                            }`}
                        >
                            <span className="block text-[9px] font-normal uppercase tracking-wide text-ivory-400 sm:text-[10px]">
                                {quick.length === 1 ? 'Only bet' : index === 0 ? 'Min' : index === quick.length - 1 ? 'Max' : 'Half'}
                            </span>
                            <span className="block truncate">{chips(value)}</span>
                        </button>
                    ))}
                </div>
            </div>
            {showCustom && limits.max > limits.min && (
                <label className={`block lg:w-36 ${customClass}`}>
                    <span className="sr-only">Custom bet amount</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        data-testid="custom-amount"
                        min={limits.min}
                        max={limits.max}
                        value={Number.isNaN(amount) ? '' : amount}
                        placeholder={`${chips(limits.min)} to ${chips(limits.max)}`}
                        onChange={(event) => setAmount(event.target.value === '' ? NaN : Number(event.target.value))}
                        className="min-h-11 w-full rounded-xl border border-white/15 bg-ink-800 px-3 text-center font-semibold text-ivory-50 focus:border-gold-400 focus:ring-gold-400"
                    />
                </label>
            )}
            {invalid && !Number.isNaN(amount) && (
                <p className="text-center text-xs text-loss-300 lg:basis-full">Choose a whole number from {chips(limits.min)} to {chips(limits.max)}.</p>
            )}
        </div>
    );
}

function Sequence({ game, nameOf, youId }) {
    const { turn } = game;
    const items = [
        ...turn.bets.map((bet) => ({ id: bet.playerId, text: chips(bet.amount), tone: 'text-gold-200 border-gold-500/40' })),
        ...turn.declined.map((id) => ({ id, text: 'declined', tone: 'text-ivory-400 border-white/10' })),
        ...(turn.askedId ? [{ id: turn.askedId, text: 'deciding', tone: 'text-ivory-100 border-gold-300/60' }] : []),
        ...turn.queue.map((id) => ({ id, text: 'next', tone: 'text-ivory-400 border-white/10' })),
    ];

    if (items.length === 0) {
        return null;
    }

    return (
        <ul aria-label="Betting sequence" className="flex gap-1.5 overflow-x-auto pb-0.5">
            {items.map((item) => (
                <li key={`${item.id}-${item.text}`} className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${item.tone}`}>
                    {item.id === youId ? 'You' : nameOf(item.id)}: {item.text}
                </li>
            ))}
        </ul>
    );
}

/**
 * Bottom panel. What it offers comes from the server's limits for this player; the server still
 * validates every bet it receives.
 */
export default function BettingPanel({ gameRoom, nameOf, onPreview }) {
    const { room, act, busy, clockOffset } = gameRoom;
    const game = room.game;
    const { turn, you } = game;
    const limits = you.limits;
    const seconds = useCountdown(game.deadline, clockOffset);
    const [amount, setAmount] = useState(limits?.min ?? 0);
    const [customOpen, setCustomOpen] = useState(false);
    const decisionKey = `${turn?.number}-${turn?.stage}-${turn?.askedId}`;

    useEffect(() => {
        setAmount(limits?.min ?? 0);
        setCustomOpen(false);
    }, [decisionKey, limits?.min]);

    const valid = limits && Number.isInteger(amount) && amount >= limits.min && amount <= limits.max;
    const previewAmount = you.mustAct && valid ? amount : null;

    useEffect(() => {
        onPreview?.(previewAmount);
    }, [previewAmount]);

    const activeName = turn ? nameOf(turn.activeId) : '';
    const askedName = turn?.askedId ? nameOf(turn.askedId) : '';

    // On a shared device "your turn" wouldn't say who should be holding it.
    const local = room.mode === 'local';

    let body;

    if (turn?.stage === 'reveal') {
        body = <p className="py-1 text-center text-sm text-ivory-200">Bets are settled. The next turn starts in a moment.</p>;
    } else if (you.mustAct && turn.stage === 'own_bet') {
        body = (
            <div className="space-y-2">
                <p data-testid="own-prompt" className="text-center text-sm font-semibold text-ivory-50">
                    {local ? `${activeName}'s turn.` : 'Your turn.'} Bet on <span className="text-gold-300">{turn.rangeLabel}</span>?
                </p>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
                    {/* Always shown on larger screens; on phones it opens on request to save table space. */}
                    {limits && (
                        <div className="lg:min-w-0 lg:flex-1">
                            <AmountPicker limits={limits} amount={amount} setAmount={setAmount} showCustom customClass={customOpen ? '' : 'hidden sm:block short:!hidden'} />
                        </div>
                    )}
                    <div className="flex gap-2 lg:w-72">
                        <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => act('pass')}>
                            Skip
                        </Button>
                        {limits && limits.max > limits.min && !customOpen && (
                            <Button variant="secondary" className="flex-1 sm:hidden short:!inline-flex" onClick={() => setCustomOpen(true)}>
                                Custom
                            </Button>
                        )}
                        <Button className="flex-[2]" disabled={busy || !valid} onClick={() => act('bet', amount)}>
                            Bet {valid ? chips(amount) : ''}
                        </Button>
                    </div>
                </div>
            </div>
        );
    } else if (you.mustAct && turn.stage === 'invite') {
        body = (
            <div className="space-y-2">
                <p data-testid="invite-prompt" className="text-center text-sm font-semibold text-ivory-50">
                    {local && `${askedName}: `}{activeName} is betting on <span className="text-gold-300">{turn.rangeLabel}</span>. Would you like to participate?
                </p>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
                    {limits && (
                        <div className="lg:min-w-0 lg:flex-1">
                            <AmountPicker limits={limits} amount={amount} setAmount={setAmount} showCustom={customOpen} />
                        </div>
                    )}
                    <div className="flex gap-2 lg:w-[26rem]">
                        <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => act('pass')}>
                            <X className="h-4 w-4" aria-hidden="true" /> Decline
                        </Button>
                        {limits && limits.max > limits.min && !customOpen && (
                            <Button variant="secondary" className="flex-1" onClick={() => setCustomOpen(true)}>
                                Custom Amount
                            </Button>
                        )}
                        <Button className="flex-1" disabled={busy || !valid} onClick={() => act('bet', amount)}>
                            Accept &amp; Bet {valid ? chips(amount) : ''}
                        </Button>
                    </div>
                </div>
            </div>
        );
    } else if (turn) {
        const waitingFor = turn.stage === 'own_bet' ? activeName : askedName;

        body = (
            <p data-testid="waiting" className="py-1 text-center text-sm text-ivory-200">
                Waiting for <span className="font-semibold text-ivory-50">{waitingFor}</span> to {turn.stage === 'own_bet' ? 'bet' : 'decide'}…
            </p>
        );
    } else {
        body = <p className="py-1 text-center text-sm text-ivory-200">Getting the next turn ready…</p>;
    }

    return (
        <div data-testid="betting-panel" className="border-t border-gold-600/30 bg-gradient-to-b from-ink-800 to-ink-950 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_24px_-12px_rgb(0_0_0_/_0.8)]">
            <div className="mx-auto max-w-2xl space-y-2 lg:max-w-5xl">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-ivory-300">
                    <span className="shrink-0">
                        Available: <strong data-testid="available" className="tabular-nums text-gold-300">{chips(game.available)}</strong>
                    </span>
                    {turn && turn.stage !== 'reveal' && (
                        <div className="lg:order-last">
                            <Timer seconds={seconds} total={room.settings.turnTimeout} />
                        </div>
                    )}
                    {/* The felt already shows bets, so phones give this space back when it's your decision. */}
                    {turn && turn.stage !== 'reveal' && (
                        <div className={`w-full min-w-0 lg:w-auto lg:flex-1 ${you.mustAct ? 'hidden sm:block short:!hidden' : ''}`}>
                            <Sequence game={game} nameOf={nameOf} youId={room.you} />
                        </div>
                    )}
                </div>
                {body}
            </div>
        </div>
    );
}
