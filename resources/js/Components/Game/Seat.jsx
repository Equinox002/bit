import { AnimatePresence, motion } from 'framer-motion';
import { Crown, WifiOff } from 'lucide-react';
import PlayingCard, { CardBack } from '@/Components/Game/PlayingCard';
import { ChipStack, PokerChip } from '@/Components/Game/PokerChip';
import { Avatar } from '@/Components/Game/ui';
import { chips, parseCard } from '@/game/format';
import useCountdown from '@/game/useCountdown';

function StatusNote({ player, isAsked }) {
    if (player.status === 'left') return 'Left';
    if (player.status === 'sitting_out') return 'Sitting out';
    if (player.status === 'waiting') return 'Next deal';
    if (isAsked) return 'Deciding…';

    return null;
}

function MiniCard({ card }) {
    const { rank, suit, label } = parseCard(card);

    return (
        <span role="img" aria-label={label} className={`rounded-sm bg-ivory-50 px-0.5 text-[9px] font-bold leading-[13px] sm:text-[10px] ${suit.red ? 'text-red-700' : 'text-ink-900'}`}>
            {rank}{suit.symbol}
        </span>
    );
}

function Delta({ outcome, show }) {
    return (
        <AnimatePresence>
            {show && outcome && (
                <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.8 }}
                    animate={{ opacity: 1, y: -6, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 1.1, duration: 0.3 }}
                    className={`absolute -top-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold shadow-card ${
                        outcome.won ? 'bg-win-600 text-white' : 'bg-loss-600 text-white'
                    }`}
                >
                    {outcome.won ? `+${chips(outcome.profit)}` : `−${chips(outcome.stake)}`}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/**
 * The time left to decide, as a ring running down around the player's avatar.
 */
function TurnRing({ timer }) {
    const seconds = useCountdown(timer.deadline, timer.clockOffset);

    if (seconds === null) {
        return null;
    }

    const circumference = 2 * Math.PI * 22;
    const left = Math.min(1, seconds / timer.total);

    return (
        <svg viewBox="0 0 48 48" aria-hidden="true" data-testid="turn-ring" className="absolute -inset-[3px] -rotate-90">
            <circle cx="24" cy="24" r="22" fill="none" stroke="rgb(0 0 0 / 0.45)" strokeWidth="3.5" />
            <circle
                cx="24"
                cy="24"
                r="22"
                fill="none"
                stroke={seconds <= 5 ? '#f87171' : '#e2bd62'}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - left)}
            />
        </svg>
    );
}

/**
 * The same information as a regular seat in a fraction of the space, for crowded tables.
 */
function CompactSeat({ large, player, member, isYou, isActive, isAsked, isDealer, declined, outcome, showDelta }) {
    const away = member && !member.connected;
    const note = StatusNote({ player, isAsked });

    return (
        <div
            data-testid={`seat-${player.name}`}
            className={`relative rounded-lg border bg-gradient-to-b from-ink-700 to-ink-950 px-1 py-0.5 shadow-card ${large ? 'h-[54px] w-28' : 'h-[50px] w-[68px]'} ${
                isActive ? 'turn-glow border-gold-400' : isAsked ? 'border-gold-300/70' : 'border-white/10'
            } ${player.status === 'left' || away ? 'opacity-60' : ''}`}
        >
            <div className="flex items-center gap-0.5">
                <Avatar name={player.name} hue={member?.hue ?? 150} size="sm" className="!h-3.5 !w-3.5 !text-[6px]" />
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold leading-tight text-ivory-50">{isYou ? 'You' : player.name}</span>
                {isDealer && <span title="Dealer" className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-ivory-50 text-[7px] font-bold text-ink-950">D</span>}
                {member?.isHost && <Crown className="h-2.5 w-2.5 shrink-0 text-gold-400" aria-label="Host" />}
                {away && <WifiOff className="h-2.5 w-2.5 shrink-0 text-loss-400" aria-label="Disconnected" />}
            </div>
            <div className="flex items-center justify-between gap-0.5 text-[9px] leading-tight sm:text-[10px]">
                <span className="flex min-w-0 items-center gap-0.5">
                    <PokerChip label={false} className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                    <span data-testid={`chips-${player.name}`} className="tabular-nums text-gold-300">{chips(player.chips)}</span>
                </span>
                {player.bet > 0 && !showDelta ? (
                    <span className="truncate font-semibold text-gold-200">Bet {chips(player.bet)}</span>
                ) : declined ? (
                    <span className="truncate text-ivory-400">Out</span>
                ) : (
                    note && !isAsked && <span className="truncate text-ivory-400">{note}</span>
                )}
            </div>
            <div className="mt-0.5 flex h-[13px] gap-0.5">
                {player.hand
                    ? player.hand.map((card) => <MiniCard key={card} card={card} />)
                    : player.hasHand && <span className="text-[9px] leading-[13px] text-ivory-400">Cards hidden</span>}
            </div>
            <Delta outcome={outcome} show={showDelta} />
        </div>
    );
}

/**
 * Two cards resting on the table in front of the player.
 */
function Hand({ player }) {
    if (!player.hand && !player.hasHand) {
        return null;
    }

    const cards = player.hand
        ? player.hand.map((card) => <PlayingCard key={card} card={card} size="seat" />)
        : [<CardBack key="first" size="seat" />, <CardBack key="second" size="seat" />];

    return (
        <div className="flex">
            <div className="origin-bottom-right -rotate-[5deg]">{cards[0]}</div>
            <div className="-ml-1 origin-bottom-left rotate-[5deg]">{cards[1]}</div>
        </div>
    );
}

/**
 * One player around the table.
 */
export default function Seat({ compact, large, timer, ...props }) {
    // Sizes follow the table rather than the screen, because the layout measures the table: held
    // sideways, a wide screen can still have a narrow table beside the betting panel.
    if (compact) {
        return <CompactSeat large={large} {...props} />;
    }

    const { player, member, isYou, isActive, isAsked, isDealer, declined, outcome, showDelta } = props;
    const note = StatusNote({ player, isAsked });
    const away = member && !member.connected;
    const inGame = player.status !== 'left';

    return (
        <div
            data-testid={`seat-${player.name}`}
            className={`relative flex flex-col items-center justify-end ${large ? 'h-[112px] w-32' : 'h-[106px] w-[84px]'} ${player.status === 'left' || away ? 'opacity-60' : ''}`}
        >
            <div className="relative z-0 -mb-1 flex w-full items-end justify-center gap-0.5">
                <Hand player={player} />
                {inGame && <ChipStack amount={player.chips} spread={5} size={large ? 26 : 19} maxColumns={1} maxPerColumn={large ? 7 : 6} />}
            </div>

            <div
                className={`relative z-[1] flex w-full items-center gap-1 rounded-xl border bg-gradient-to-b from-ink-700 to-ink-950 px-1 py-1 shadow-card sm:gap-1.5 sm:px-1.5 ${
                    isActive ? 'turn-glow border-gold-400' : isAsked ? 'border-gold-300/80' : 'border-white/15'
                }`}
            >
                <div className="relative shrink-0">
                    <Avatar name={player.name} hue={member?.hue ?? 150} size="sm" className={large ? '!h-8 !w-8 !text-xs' : '!h-6 !w-6 !text-[9px]'} />
                    {timer && <TurnRing timer={timer} />}
                    {isDealer && (
                        <span title="Dealer" className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ivory-50 text-[8px] font-bold text-ink-950 shadow-card">
                            D
                        </span>
                    )}
                </div>
                <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-0.5">
                        <span className={`truncate font-semibold leading-tight text-ivory-50 ${large ? 'text-xs' : 'text-[11px]'}`}>
                            {isYou ? 'You' : player.name}
                        </span>
                        {member?.isHost && <Crown className="h-2.5 w-2.5 shrink-0 text-gold-400" aria-label="Host" />}
                        {away && <WifiOff className="h-2.5 w-2.5 shrink-0 text-loss-400" aria-label="Disconnected" />}
                    </div>
                    <div className="flex items-center gap-0.5 sm:gap-1">
                        <PokerChip label={false} className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span data-testid={`chips-${player.name}`} className="text-[10px] font-medium tabular-nums leading-tight text-gold-300 sm:text-xs">{chips(player.chips)}</span>
                    </div>
                </div>
            </div>

            <div className="mt-0.5 h-3.5 w-full truncate text-center text-[10px] font-medium leading-[14px]">
                {declined ? (
                    <span className="text-ivory-300">Declined</span>
                ) : (
                    <span className={isAsked ? 'text-gold-200' : 'text-ivory-300'}>{note}</span>
                )}
            </div>

            <Delta outcome={outcome} show={showDelta} />
        </div>
    );
}
