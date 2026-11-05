import { useState } from 'react';
import { EmptyState, formatDay, formatNumber } from '@/Components/Admin/ui';

// Even numbers, so the middle gridline is always a whole number.
function niceCeiling(value) {
    if (value <= 4) {
        return 4;
    }

    const magnitude = 10 ** Math.floor(Math.log10(value));
    const step = [1, 2, 4, 6, 8, 10].find((candidate) => value <= candidate * magnitude);

    return step * magnitude;
}

export function ColumnChart({ data, valueKey, label, detail }) {
    const [active, setActive] = useState(null);
    const values = data.map((row) => row[valueKey]);
    const peak = Math.max(...values);

    if (peak === 0) {
        return <EmptyState>Nothing in this period yet.</EmptyState>;
    }

    const ceiling = niceCeiling(peak);
    const count = data.length;
    const current = active === null ? null : data[active];
    const peakDay = data[values.indexOf(peak)];

    const onKeyDown = (event) => {
        const move = { ArrowLeft: -1, ArrowRight: 1 }[event.key];

        if (move) {
            event.preventDefault();
            setActive((index) => Math.min(count - 1, Math.max(0, (index ?? count) + move)));
        }
    };

    // Keeps the tooltip on the card when hovering the first or last columns.
    const edge = active === null ? '' : active < count * 0.2 ? '-translate-x-[15%]' : active > count * 0.8 ? '-translate-x-[85%]' : '-translate-x-1/2';

    return (
        <div>
            <p className="mb-3 text-xs text-ivory-400">
                Peak {formatNumber(peak)} on {formatDay(peakDay.date)}
            </p>
            <div className="relative h-44 pt-2">
                <div className="absolute inset-x-0 bottom-0 top-2">
                    {[0, 0.5, 1].map((share) => (
                        <div key={share} className="absolute inset-x-0 flex items-center" style={{ bottom: `${share * 100}%` }}>
                            <span className="w-8 translate-y-1/2 pr-2 text-right text-[11px] tabular-nums text-ivory-400">{formatNumber(ceiling * share)}</span>
                            <span className="h-px flex-1 translate-y-1/2 bg-white/10" />
                        </div>
                    ))}
                </div>
                <div
                    role="group"
                    tabIndex={0}
                    aria-label={`${label}, by day. Use the left and right arrow keys to read each day.`}
                    onKeyDown={onKeyDown}
                    onMouseLeave={() => setActive(null)}
                    onBlur={() => setActive(null)}
                    className="absolute bottom-0 left-8 right-0 top-2 flex items-end gap-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                >
                    {data.map((row, index) => (
                        <div
                            key={row.date}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => setActive(index)}
                            className="flex h-full min-w-0 flex-1 items-end justify-center"
                        >
                            {row[valueKey] > 0 && (
                                <div
                                    className={`w-full max-w-6 rounded-t transition-colors ${active === index ? 'bg-gold-400' : 'bg-gold-600'}`}
                                    style={{ height: `max(2px, ${(row[valueKey] / ceiling) * 100}%)` }}
                                />
                            )}
                        </div>
                    ))}
                    {current && (
                        <div
                            aria-live="polite"
                            className={`pointer-events-none absolute z-10 w-max rounded-lg border border-white/10 bg-ink-700 px-3 py-2 text-xs shadow-card ${edge}`}
                            style={{ left: `${((active + 0.5) / count) * 100}%`, bottom: `calc(${Math.min(70, (current[valueKey] / ceiling) * 100)}% + 8px)` }}
                        >
                            <p className="font-medium text-ivory-50">{formatDay(current.date)}</p>
                            <p className="mt-0.5 tabular-nums text-ivory-200">
                                {formatNumber(current[valueKey])} {label.toLowerCase()}
                            </p>
                            {detail?.(current) && <p className="tabular-nums text-ivory-300">{detail(current)}</p>}
                        </div>
                    )}
                </div>
            </div>
            <div className="mt-1.5 flex justify-between pl-8 text-[11px] text-ivory-400">
                <span>{formatDay(data[0].date)}</span>
                <span>{formatDay(data[Math.floor((count - 1) / 2)].date)}</span>
                <span>{formatDay(data[count - 1].date)}</span>
            </div>
            <details className="mt-3 text-xs text-ivory-400">
                <summary className="cursor-pointer select-none hover:text-ivory-200">View as table</summary>
                <div className="mt-2 max-h-56 overflow-y-auto">
                    <table className="w-full text-left tabular-nums">
                        <thead>
                            <tr className="text-ivory-400">
                                <th scope="col" className="py-1 font-medium">Day</th>
                                <th scope="col" className="py-1 text-right font-medium">{label}</th>
                            </tr>
                        </thead>
                        <tbody className="text-ivory-200">
                            {[...data].reverse().map((row) => (
                                <tr key={row.date} className="border-t border-white/5">
                                    <td className="py-1">{formatDay(row.date)}</td>
                                    <td className="py-1 text-right">{formatNumber(row[valueKey])}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    );
}

export function RankedBars({ rows, format = (label) => label, empty = 'Nothing in this period yet.' }) {
    if (rows.length === 0) {
        return <EmptyState>{empty}</EmptyState>;
    }

    const largest = rows[0].total;
    const total = rows.reduce((sum, row) => sum + row.total, 0);

    return (
        <ul className="space-y-3">
            {rows.map((row) => (
                <li key={row.label ?? 'none'}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-ivory-200" title={format(row.label)}>
                            {format(row.label)}
                        </span>
                        <span className="shrink-0 tabular-nums text-ivory-100">
                            {formatNumber(row.total)}
                            <span className="ml-1.5 text-xs text-ivory-400">{Math.round((row.total / total) * 100)}%</span>
                        </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-r bg-white/5">
                        <div className="h-full rounded-r bg-gold-600" style={{ width: `${Math.max(1, (row.total / largest) * 100)}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}
