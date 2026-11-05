import { Link } from '@inertiajs/react';
import {
    Badge,
    EmptyState,
    PageHeader,
    Pagination,
    RoomStatus,
    SearchField,
    Section,
    SelectField,
    Table,
    cellClass,
    formatDate,
    formatNumber,
    timeAgo,
    useFilters,
} from '@/Components/Admin/ui';
import AdminLayout from '@/Layouts/AdminLayout';

export default function Rooms({ filters, rooms }) {
    const apply = useFilters('admin.rooms', filters);

    return (
        <AdminLayout title="Rooms">
            <PageHeader title="Rooms" description={`${formatNumber(rooms.total)} rooms.`} />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <SearchField label="Search rooms" placeholder="Room code or name" value={filters.q} onSearch={(q) => apply({ q })} />
                <SelectField
                    label="Status"
                    value={filters.status}
                    onChange={(status) => apply({ status })}
                    options={[
                        ['', 'All statuses'],
                        ['playing', 'Playing'],
                        ['lobby', 'In lobby'],
                        ['finished', 'Finished'],
                        ['closed', 'Closed'],
                    ]}
                />
            </div>

            <Section title="All rooms">
                {rooms.data.length === 0 ? (
                    <EmptyState>No rooms match these filters.</EmptyState>
                ) : (
                    <Table caption="Rooms" columns={['Room', 'Code', 'Status', 'Access', 'Host', 'Seated', 'Games', 'Last activity', 'Created']} minWidth="min-w-[860px]">
                        {rooms.data.map((room) => (
                            <tr key={room.id} className="hover:bg-white/[0.03]">
                                <td className={`${cellClass} max-w-56 truncate text-ivory-100`} title={room.name}>
                                    {room.name}
                                </td>
                                <td className={`${cellClass} font-mono text-xs`}>
                                    <Link href={route('admin.visits', { q: `/rooms/${room.code}` })} className="underline-offset-2 hover:underline">
                                        {room.code}
                                    </Link>
                                </td>
                                <td className={cellClass}>
                                    <RoomStatus status={room.status} />
                                </td>
                                <td className={cellClass}>
                                    <Badge>{room.isPrivate ? 'Private' : 'Public'}</Badge>
                                </td>
                                <td className={`${cellClass} max-w-40 truncate`}>{room.host ?? '—'}</td>
                                <td className={`${cellClass} tabular-nums`}>{formatNumber(room.players)}</td>
                                <td className={`${cellClass} tabular-nums`}>{formatNumber(room.games)}</td>
                                <td className={`${cellClass} whitespace-nowrap text-ivory-400`}>{timeAgo(room.updatedAt)}</td>
                                <td className={`${cellClass} whitespace-nowrap text-ivory-400`}>{formatDate(room.createdAt)}</td>
                            </tr>
                        ))}
                    </Table>
                )}
                <Pagination page={rooms} />
            </Section>
        </AdminLayout>
    );
}
