import { motion } from 'framer-motion';
import { parseCard } from '@/game/format';

const SIZES = {
    xs: 'h-9 w-[26px] rounded text-[10px]',
    seat: 'h-11 w-8 rounded text-[11px] sm:h-[52px] sm:w-9 sm:rounded-md sm:text-xs short:!h-11 short:!w-8 short:!text-[11px]',
    sm: 'h-[52px] w-9 rounded-md text-xs',
    md: 'h-20 w-14 rounded-lg text-base sm:h-28 sm:w-20 sm:text-xl short:!h-20 short:!w-14 short:!text-base',
    lg: 'h-24 w-[68px] rounded-xl text-xl sm:h-36 sm:w-[102px] sm:text-3xl',
};

export function CardBack({ size = 'md', className = '' }) {
    return (
        <div
            aria-label="Face-down card"
            role="img"
            className={`${SIZES[size]} shrink-0 border border-gold-600/70 bg-gradient-to-br from-felt-600 to-felt-900 p-[3px] shadow-card ${className}`}
        >
            <div
                className="flex h-full w-full items-center justify-center rounded-[inherit] border border-gold-500/40"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgb(226 189 98 / 0.18) 0 2px, transparent 2px 7px), repeating-linear-gradient(-45deg, rgb(226 189 98 / 0.18) 0 2px, transparent 2px 7px)' }}
            >
                <span className="h-[28%] w-auto rotate-45 rounded-[2px] border border-gold-400/70 bg-felt-800" style={{ aspectRatio: '1' }} />
            </div>
        </div>
    );
}

export default function PlayingCard({ card, size = 'md', className = '' }) {
    const { rank, suit, label } = parseCard(card);
    const color = suit.red ? 'text-red-700' : 'text-ink-900';

    return (
        <div
            role="img"
            aria-label={label}
            className={`${SIZES[size]} relative shrink-0 select-none border border-black/20 bg-gradient-to-br from-white to-ivory-100 font-semibold shadow-card ${color} ${className}`}
        >
            <span className="absolute left-[8%] top-[4%] flex flex-col items-center leading-none">
                <span>{rank}</span>
                <span className="text-[0.85em]">{suit.symbol}</span>
            </span>
            {size === 'seat' && (
                <span className="absolute bottom-[6%] right-[10%] text-[1.5em] leading-none opacity-90">{suit.symbol}</span>
            )}
            {size !== 'xs' && size !== 'seat' && (
                <span className="absolute inset-0 flex items-center justify-center pt-[12%] text-[1.9em] leading-none opacity-90">
                    {suit.symbol}
                </span>
            )}
            {size !== 'xs' && size !== 'seat' && (
                <span className="absolute bottom-[4%] right-[8%] flex rotate-180 flex-col items-center leading-none">
                    <span>{rank}</span>
                    <span className="text-[0.85em]">{suit.symbol}</span>
                </span>
            )}
        </div>
    );
}

/**
 * A card that turns over when it appears.
 */
export function RevealedCard({ card, size = 'lg', className = '' }) {
    return (
        <motion.div
            initial={{ rotateY: 90, y: -24, opacity: 0 }}
            animate={{ rotateY: 0, y: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: 0.15 }}
            style={{ transformPerspective: 800 }}
        >
            <PlayingCard card={card} size={size} className={className} />
        </motion.div>
    );
}
