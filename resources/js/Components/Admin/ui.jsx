import { Link, router } from '@inertiajs/react';
import { Bot, ChevronLeft, ChevronRight, Monitor, Search, Smartphone, Tablet } from 'lucide-react';
import { useState } from 'react';
import { Panel } from '@/Components/Game/ui';

const whole = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export const formatNumber = (value) => whole.format(value);

export const formatBig = (value) => (value >= 10000 ? compact.format(value) : whole.format(value));

export const formatDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export const formatDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Daily rows are plain calendar days, so they are read as UTC and shown as UTC to stop them shifting a day.
export const formatDay = (day) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function timeAgo(iso) {
    if (!iso) {
        return '—';
    }

    const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));

    if (seconds < 60) {
        return 'just now';
    }

    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m ago`;
    }

    if (seconds < 86400) {
        return `${Math.floor(seconds / 3600)}h ago`;
    }

    return `${Math.floor(seconds / 86400)}d ago`;
}

export function PageHeader({ title, description, children }) {
    return (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
                <h1 className="font-display text-3xl text-ivory-50">{title}</h1>
                {description && <p className="mt-1 text-sm text-ivory-400">{description}</p>}
            </div>
            {children}
        </div>
    );
}

export function StatTile({ label, value, detail, icon: Icon }) {
    return (
        <Panel className="p-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-ivory-300">{label}</p>
                {Icon && <Icon className="h-4 w-4 shrink-0 text-gold-400" aria-hidden="true" />}
            </div>
            <p className="mt-2 text-3xl font-semibold text-ivory-50">{value}</p>
            {detail && <p className="mt-1 text-xs text-ivory-400">{detail}</p>}
        </Panel>
    );
}

export function Section({ title, description, action, className = '', children }) {
    return (
        <Panel className={`min-w-0 p-4 sm:p-5 ${className}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="font-semibold text-ivory-50">{title}</h2>
                    {description && <p className="mt-0.5 text-xs text-ivory-400">{description}</p>}
                </div>
                {action}
            </div>
            {children}
        </Panel>
    );
}

const BADGE_TONES = {
    neutral: 'bg-white/5 text-ivory-300 ring-white/10',
    gold: 'bg-gold-500/10 text-gold-300 ring-gold-500/30',
    good: 'bg-win-600/15 text-win-300 ring-win-600/30',
    bad: 'bg-loss-600/15 text-loss-300 ring-loss-600/30',
};

export function Badge({ tone = 'neutral', children }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}>
            {children}
        </span>
    );
}

const ROOM_STATUS = {
    playing: { tone: 'good', label: 'Playing' },
    lobby: { tone: 'gold', label: 'In lobby' },
    finished: { tone: 'neutral', label: 'Finished' },
    closed: { tone: 'neutral', label: 'Closed' },
};

export function RoomStatus({ status }) {
    const { tone, label } = ROOM_STATUS[status] ?? { tone: 'neutral', label: status };

    return <Badge tone={tone}>{label}</Badge>;
}

const DEVICES = {
    desktop: { icon: Monitor, label: 'Desktop' },
    mobile: { icon: Smartphone, label: 'Mobile' },
    tablet: { icon: Tablet, label: 'Tablet' },
    bot: { icon: Bot, label: 'Bot' },
};

export const deviceLabel = (device) => DEVICES[device]?.label ?? device;

export function DeviceCell({ visit }) {
    const Icon = DEVICES[visit.device]?.icon ?? Monitor;

    return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <Icon className="h-4 w-4 shrink-0 text-ivory-400" aria-hidden="true" />
            <span className="sr-only">{deviceLabel(visit.device)}: </span>
            <span>{visit.browser}</span>
            <span className="text-ivory-400">{visit.os}</span>
        </span>
    );
}

export function VisitorName({ user }) {
    if (!user) {
        return <span className="text-ivory-400">Anonymous</span>;
    }

    return (
        <Link href={route('admin.visits', { user: user.id })} className="text-ivory-100 underline-offset-2 hover:underline">
            {user.name}
            {user.isGuest && <span className="text-ivory-400"> (guest)</span>}
        </Link>
    );
}

const FIELD = 'min-h-11 rounded-xl border-white/10 bg-ink-800 text-sm text-ivory-50 placeholder:text-ivory-400 focus:border-gold-400 focus:ring-gold-400';

export function useFilters(routeName, filters) {
    return (changes) => {
        const next = Object.fromEntries(Object.entries({ ...filters, ...changes }).filter(([, value]) => value !== '' && value != null));

        router.get(route(routeName), next, { preserveState: true, preserveScroll: true, replace: true });
    };
}

export function SearchField({ label, placeholder, value, onSearch }) {
    const [text, setText] = useState(value ?? '');

    return (
        <form
            role="search"
            className="relative min-w-0 flex-1 basis-56"
            onSubmit={(event) => {
                event.preventDefault();
                onSearch(text.trim());
            }}
        >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory-400" aria-hidden="true" />
            <input
                type="search"
                aria-label={label}
                placeholder={placeholder}
                value={text}
                maxLength={120}
                onChange={(event) => setText(event.target.value)}
                className={`${FIELD} w-full pl-9`}
            />
        </form>
    );
}

export function SelectField({ label, value, onChange, options }) {
    return (
        <select aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className={FIELD}>
            {options.map(([optionValue, optionLabel]) => (
                <option key={optionValue} value={optionValue}>
                    {optionLabel}
                </option>
            ))}
        </select>
    );
}

export function Table({ caption, columns, minWidth = 'min-w-[720px]', children }) {
    return (
        // Relative so visually hidden labels stay inside the scroll area instead of widening the page.
        <div className="relative overflow-x-auto">
            <table className={`w-full text-left text-sm text-ivory-200 ${minWidth}`}>
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr className="border-b border-white/10 text-xs text-ivory-400">
                        {columns.map((column) => (
                            <th key={column} scope="col" className="whitespace-nowrap px-3 py-2 font-medium first:pl-0 last:pr-0">
                                {column}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">{children}</tbody>
            </table>
        </div>
    );
}

export const cellClass = 'px-3 py-2.5 align-middle first:pl-0 last:pr-0';

export function EmptyState({ children }) {
    return <p className="py-8 text-center text-sm text-ivory-400">{children}</p>;
}

export function Pagination({ page }) {
    if (page.total === 0) {
        return null;
    }

    const step = 'inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-ivory-200';

    return (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm text-ivory-400">
            <p className="tabular-nums">
                {formatNumber(page.from)}–{formatNumber(page.to)} of {formatNumber(page.total)}
            </p>
            <div className="flex items-center gap-2">
                {page.prev_page_url ? (
                    <Link href={page.prev_page_url} preserveScroll aria-label="Previous page" className={`${step} hover:bg-white/5`}>
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Link>
                ) : (
                    <span className={`${step} opacity-40`} aria-hidden="true">
                        <ChevronLeft className="h-4 w-4" />
                    </span>
                )}
                <span className="tabular-nums">
                    {page.current_page} / {page.last_page}
                </span>
                {page.next_page_url ? (
                    <Link href={page.next_page_url} preserveScroll aria-label="Next page" className={`${step} hover:bg-white/5`}>
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                ) : (
                    <span className={`${step} opacity-40`} aria-hidden="true">
                        <ChevronRight className="h-4 w-4" />
                    </span>
                )}
            </div>
        </nav>
    );
}
