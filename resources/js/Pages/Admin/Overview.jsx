import { Link } from '@inertiajs/react';
import { Activity, Coins, Eye, Gamepad2, Radio, Trophy, UserRound, Users } from 'lucide-react';
import { ColumnChart, RankedBars } from '@/Components/Admin/charts';
import {
    Badge,
    DeviceCell,
    EmptyState,
    PageHeader,
    RoomStatus,
    Section,
    StatTile,
    Table,
    VisitorName,
    cellClass,
    deviceLabel,
    formatBig,
    formatDateTime,
    formatNumber,
    timeAgo,
} from '@/Components/Admin/ui';
import AdminLayout from '@/Layouts/AdminLayout';

function RangePicker({ days, ranges }) {
    return (
        <div role="group" aria-label="Period for charts and breakdowns" className="inline-flex rounded-xl border border-white/10 bg-ink-900/80 p-1">
            {ranges.map((range) => (
                <Link
                    key={range}
                    href={route('admin.overview', { days: range })}
                    preserveScroll
                    aria-current={range === days ? 'true' : undefined}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${range === days ? 'bg-gold-500/15 font-medium text-gold-200' : 'text-ivory-300 hover:text-ivory-50'}`}
                >
                    {range} days
                </Link>
            ))}
        </div>
    );
}

export default function Overview({ days, ranges, stats, visitsByDay, gamesByDay, pages, devices, browsers, systems, referrers, addresses, recentVisits, liveRooms, timezone }) {
    return (
        <AdminLayout title="Admin overview">
            <PageHeader title="Overview" description={`Days follow ${timezone}. Bots are left out of the totals.`}>
                <RangePicker days={days} ranges={ranges} />
            </PageHeader>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Active now" value={formatBig(stats.activeNow)} detail={`In the last ${stats.activeMinutes} minutes`} icon={Radio} />
                <StatTile label="Visitors today" value={formatBig(stats.visitorsToday)} detail={`${formatNumber(stats.visitorsYesterday)} yesterday`} icon={UserRound} />
                <StatTile label="Page views today" value={formatBig(stats.viewsToday)} detail={`${formatNumber(stats.viewsYesterday)} yesterday`} icon={Eye} />
                <StatTile label="Accounts" value={formatBig(stats.accounts)} detail={`${formatNumber(stats.guests)} guest players`} icon={Users} />
                <StatTile label="Rooms in play" value={formatBig(stats.roomsPlaying)} detail={`${formatNumber(stats.roomsLobby)} waiting in lobby`} icon={Gamepad2} />
                <StatTile label="Players at tables" value={formatBig(stats.playersSeated)} detail="Connected, in a live game" icon={Activity} />
                <StatTile label="Games finished" value={formatBig(stats.gamesFinished)} detail={`${formatNumber(stats.roomsTotal)} rooms created`} icon={Trophy} />
                <StatTile label="Chips bet" value={formatBig(stats.chipsBet)} detail={`Across ${formatNumber(stats.betsPlaced)} bets`} icon={Coins} />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Section title="Page views" description={`Last ${days} days`}>
                    <ColumnChart data={visitsByDay} valueKey="views" label="Page views" detail={(row) => `${formatNumber(row.visitors)} visitors`} />
                </Section>
                <Section title="Games started" description={`Last ${days} days`}>
                    <ColumnChart data={gamesByDay} valueKey="games" label="Games started" />
                </Section>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Section title="Top pages">
                    <RankedBars rows={pages} />
                </Section>
                <Section title="Devices">
                    <RankedBars rows={devices} format={deviceLabel} />
                </Section>
                <Section title="Browsers">
                    <RankedBars rows={browsers} />
                </Section>
                <Section title="Operating systems">
                    <RankedBars rows={systems} />
                </Section>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Section title="Top IP addresses" description={`Last ${days} days`}>
                    {addresses.length === 0 ? (
                        <EmptyState>No visits in this period yet.</EmptyState>
                    ) : (
                        <Table caption="Top IP addresses" columns={['IP address', 'Page views', 'Last seen']} minWidth="min-w-[320px]">
                            {addresses.map((address) => (
                                <tr key={address.ip}>
                                    <td className={cellClass}>
                                        <Link href={route('admin.visits', { q: address.ip })} className="font-mono text-xs text-ivory-100 underline-offset-2 hover:underline">
                                            {address.ip}
                                        </Link>
                                    </td>
                                    <td className={`${cellClass} tabular-nums`}>{formatNumber(address.total)}</td>
                                    <td className={`${cellClass} text-ivory-400`}>{timeAgo(address.lastSeen)}</td>
                                </tr>
                            ))}
                        </Table>
                    )}
                </Section>
                <Section title="Where visitors came from" description="Other websites that linked here">
                    <RankedBars rows={referrers} empty="No visits from other websites in this period." />
                </Section>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Section
                    className="xl:col-span-2"
                    title="Latest visits"
                    action={
                        <Link href={route('admin.visits')} className="shrink-0 text-sm text-gold-300 hover:text-gold-200">
                            View all
                        </Link>
                    }
                >
                    {recentVisits.length === 0 ? (
                        <EmptyState>No visits recorded yet.</EmptyState>
                    ) : (
                        <Table caption="Latest visits" columns={['When', 'IP address', 'Visitor', 'Page', 'Device']}>
                            {recentVisits.map((visit) => (
                                <tr key={visit.id}>
                                    <td className={`${cellClass} whitespace-nowrap text-ivory-400`}>{formatDateTime(visit.at)}</td>
                                    <td className={`${cellClass} font-mono text-xs`}>{visit.ip}</td>
                                    <td className={cellClass}>
                                        <VisitorName user={visit.user} />
                                    </td>
                                    <td className={`${cellClass} max-w-48 truncate`} title={visit.path}>
                                        {visit.path}
                                    </td>
                                    <td className={cellClass}>
                                        <DeviceCell visit={visit} />
                                    </td>
                                </tr>
                            ))}
                        </Table>
                    )}
                </Section>
                <Section
                    title="Live rooms"
                    action={
                        <Link href={route('admin.rooms')} className="shrink-0 text-sm text-gold-300 hover:text-gold-200">
                            View all
                        </Link>
                    }
                >
                    {liveRooms.length === 0 ? (
                        <EmptyState>No rooms open right now.</EmptyState>
                    ) : (
                        <ul className="divide-y divide-white/5">
                            {liveRooms.map((room) => (
                                <li key={room.code} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm text-ivory-100">{room.name}</p>
                                        <p className="mt-0.5 truncate text-xs text-ivory-400">
                                            <span className="font-mono">{room.code}</span> · {room.host ?? 'No host'} · {room.players} seated
                                        </p>
                                    </div>
                                    <RoomStatus status={room.status} />
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>
            </div>
        </AdminLayout>
    );
}
