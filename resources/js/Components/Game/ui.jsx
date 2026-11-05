import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PokerChip } from '@/Components/Game/PokerChip';
import { chips } from '@/game/format';

const BUTTON_STYLES = {
    primary: 'bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 hover:from-gold-200 hover:to-gold-400 focus-visible:ring-gold-200 font-semibold shadow-card',
    secondary: 'bg-gradient-to-b from-ink-600 to-ink-700 text-ivory-50 hover:from-ink-600 hover:to-ink-600 focus-visible:ring-ivory-300 border border-white/10',
    ghost: 'text-ivory-200 hover:bg-white/5 focus-visible:ring-ivory-300',
    danger: 'bg-loss-600/90 text-white hover:bg-loss-600 focus-visible:ring-loss-300 font-semibold',
};

export function buttonClass(variant = 'primary', extra = '') {
    return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${extra}`;
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }) {
    return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function ChipAmount({ amount, className = '', iconClass = 'h-3.5 w-3.5' }) {
    return (
        <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
            <PokerChip label={false} className={iconClass} />
            <span>{chips(amount)}</span>
            <span className="sr-only">chips</span>
        </span>
    );
}

export function Avatar({ name, hue = 150, size = 'md', className = '' }) {
    const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' };
    const initials = name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();

    return (
        <span
            aria-hidden="true"
            className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-white/20 ${sizes[size]} ${className}`}
            style={{ background: `linear-gradient(145deg, hsl(${hue} 45% 42%), hsl(${hue} 50% 26%))` }}
        >
            {initials}
        </span>
    );
}

export function Panel({ className = '', children }) {
    return <div className={`rounded-2xl border border-white/10 bg-ink-900/80 shadow-card ${className}`}>{children}</div>;
}

export function Dialog({ open, onClose, title, children, wide = false }) {
    const panel = useRef(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    // Depends only on `open`: live game updates re-render the parent and must not steal focus.
    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const previous = document.activeElement;
        panel.current?.focus();
        const onKey = (event) => event.key === 'Escape' && closeRef.current?.();
        window.addEventListener('keydown', onKey);

        return () => {
            window.removeEventListener('keydown', onKey);
            previous?.focus?.();
        };
    }, [open]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
                >
                    <motion.div
                        ref={panel}
                        tabIndex={-1}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        className={`flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-white/10 bg-ink-900 shadow-2xl outline-none sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
                        initial={{ y: 24 }}
                        animate={{ y: 0 }}
                        exit={{ y: 24 }}
                        transition={{ duration: 0.18 }}
                    >
                        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
                            <h2 className="font-display text-lg text-ivory-50">{title}</h2>
                            {onClose && (
                                <button
                                    type="button"
                                    aria-label="Close"
                                    onClick={onClose}
                                    className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-ivory-300 hover:bg-white/5"
                                >
                                    <X className="h-5 w-5" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                        <div className="overflow-y-auto px-5 py-4">{children}</div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function Logo({ className = 'h-9 w-9' }) {
    return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
            <rect x="5" y="9" width="22" height="31" rx="4" fill="#0e4d3a" stroke="#e2bd62" strokeWidth="1.5" transform="rotate(-12 16 24)" />
            <rect x="21" y="9" width="22" height="31" rx="4" fill="#0e4d3a" stroke="#e2bd62" strokeWidth="1.5" transform="rotate(12 32 24)" />
            <rect x="13" y="7" width="22" height="33" rx="4" fill="#faf7ef" stroke="#a77f2a" strokeWidth="1.5" />
            <path d="M24 15l6.5 8.5L24 32l-6.5-8.5z" fill="#cfa23f" />
        </svg>
    );
}
