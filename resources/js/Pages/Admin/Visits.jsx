import { Link } from '@inertiajs/react';
import { ChevronDown } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
    Badge,
    DeviceCell,
    EmptyState,
    PageHeader,
    Pagination,
    SearchField,
    Section,
    SelectField,
    Table,
    VisitorName,
    cellClass,
    deviceLabel,
    formatDateTime,
    formatNumber,
    useFilters,
} from '@/Components/Admin/ui';
import AdminLayout from '@/Layouts/AdminLayout';

function Detail({ label, children }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-ivory-400">{label}</dt>
            <dd className="mt-0.5 break-words text-sm text-ivory-100">{children ?? '—'}</dd>
        </div>
    );
}

function VisitDetails({ visit }) {
    return (
        <dl className="grid gap-4 rounded-xl bg-white/[0.03] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Full page address">{visit.path}</Detail>
            <Detail label="Came from">{visit.referrer ?? 'Direct or this site'}</Detail>
            <Detail label="Device type">{deviceLabel(visit.device)}</Detail>
            <Detail label="Language">{visit.language}</Detail>
            <Detail label="Server response">{visit.status}</Detail>
            <Detail label="Response time">{visit.durationMs === null ? null : `${formatNumber(visit.durationMs)} ms`}</Detail>
            <Detail label="Exact time">{new Date(visit.at).toLocaleString()}</Detail>
            <Detail label="Visitor ID">
                <span className="font-mono text-xs">{visit.visitor.slice(0, 12)}</span>
            </Detail>
            <div className="sm:col-span-2 lg:col-span-4">
                <Detail label="Browser details (user agent)">
                    <span className="font-mono text-xs">{visit.userAgent}</span>
                </Detail>
            </div>
        </dl>
    );
}

export default function Visits({ filters, visits, summary }) {
    const apply = useFilters('admin.visits', filters);
    const [open, setOpen] = useState(null);

    return (
        <AdminLayout title="Visits">
            <PageHeader
                title="Visits"
                description={`${formatNumber(visits.total)} page views from ${formatNumber(summary.visitors)} visitors and ${formatNumber(summary.addresses)} IP addresses.`}
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <SearchField label="Search visits" placeholder="IP address, page, player or browser" value={filters.q} onSearch={(q) => apply({ q })} />
                <SelectField
                    label="Device"
                    value={filters.device}
                    onChange={(device) => apply({ device })}
                    options={[
                        ['', 'All devices'],
                        ['desktop', 'Desktop'],
                        ['mobile', 'Mobile'],
                        ['tablet', 'Tablet'],
                        ['bot', 'Bots only'],
                    ]}
                />
                <SelectField
                    label="Period"
                    value={filters.days}
                    onChange={(days) => apply({ days })}
                    options={[
                        ['', 'All time'],
                        ['1', 'Today'],
                        ['7', 'Last 7 days'],
                        ['30', 'Last 30 days'],
                        ['90', 'Last 90 days'],
                    ]}
                />
                {filters.user && (
                    <Link href={route('admin.visits')} className="rounded-xl border border-gold-500/30 px-3 py-2.5 text-sm text-gold-200 hover:bg-white/5">
                        One player only. Clear
                    </Link>
                )}
            </div>

            <Section title="Page views" description="Use the arrow on a row to see everything recorded for that visit.">
                {visits.data.length === 0 ? (
                    <EmptyState>No visits match these filters.</EmptyState>
                ) : (
                    <Table caption="Page views" columns={['When', 'IP address', 'Visitor', 'Page', 'Device', 'Status', '']} minWidth="min-w-[860px]">
                        {visits.data.map((visit) => (
                            <Fragment key={visit.id}>
                                <tr className="hover:bg-white/[0.03]">
                                    <td className={`${cellClass} whitespace-nowrap text-ivory-400`}>{formatDateTime(visit.at)}</td>
                                    <td className={`${cellClass} font-mono text-xs`}>{visit.ip}</td>
                                    <td className={cellClass}>
                                        <VisitorName user={visit.user} />
                                    </td>
                                    <td className={`${cellClass} max-w-56 truncate`} title={visit.path}>
                                        {visit.path}
                                    </td>
                                    <td className={cellClass}>
                                        <DeviceCell visit={visit} />
                                    </td>
                                    <td className={cellClass}>
                                        <Badge tone={visit.status >= 400 ? 'bad' : 'neutral'}>{visit.status}</Badge>
                                    </td>
                                    <td className={`${cellClass} w-10`}>
                                        <button
                                            type="button"
                                            aria-expanded={open === visit.id}
                                            aria-label={`Details for the visit at ${formatDateTime(visit.at)}`}
                                            onClick={() => setOpen(open === visit.id ? null : visit.id)}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ivory-300 hover:bg-white/5"
                                        >
                                            <ChevronDown className={`h-4 w-4 transition-transform ${open === visit.id ? 'rotate-180' : ''}`} aria-hidden="true" />
                                        </button>
                                    </td>
                                </tr>
                                {open === visit.id && (
                                    <tr>
                                        <td colSpan={7} className="py-3">
                                            <VisitDetails visit={visit} />
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        ))}
                    </Table>
                )}
                <Pagination page={visits} />
            </Section>
        </AdminLayout>
    );
}
