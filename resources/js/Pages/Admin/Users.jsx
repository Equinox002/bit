import { Link } from '@inertiajs/react';
import {
    Badge,
    EmptyState,
    PageHeader,
    Pagination,
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
import { Avatar } from '@/Components/Game/ui';
import AdminLayout from '@/Layouts/AdminLayout';

function AccountType({ user }) {
    if (user.isAdmin) {
        return <Badge tone="gold">Admin</Badge>;
    }

    return user.isGuest ? <Badge>Guest</Badge> : <Badge tone="good">Registered</Badge>;
}

export default function Users({ filters, users }) {
    const apply = useFilters('admin.users', filters);

    return (
        <AdminLayout title="Players">
            <PageHeader title="Players" description={`${formatNumber(users.total)} accounts and guest players.`} />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <SearchField label="Search players" placeholder="Name or email" value={filters.q} onSearch={(q) => apply({ q })} />
                <SelectField
                    label="Account type"
                    value={filters.type}
                    onChange={(type) => apply({ type })}
                    options={[
                        ['', 'All types'],
                        ['registered', 'Registered'],
                        ['guest', 'Guests'],
                        ['admin', 'Admins'],
                    ]}
                />
            </div>

            <Section title="All players">
                {users.data.length === 0 ? (
                    <EmptyState>No players match these filters.</EmptyState>
                ) : (
                    <Table caption="Players" columns={['Player', 'Type', 'Games', 'Won', 'Bets', 'Chips won / lost', 'Visits', 'Last IP', 'Last seen', 'Joined']} minWidth="min-w-[1040px]">
                        {users.data.map((user) => (
                            <tr key={user.id} className="hover:bg-white/[0.03]">
                                <td className={cellClass}>
                                    <div className="flex items-center gap-2.5">
                                        <Avatar name={user.name} size="sm" />
                                        <div className="min-w-0">
                                            <p className="max-w-44 truncate text-ivory-100">{user.name}</p>
                                            <p className="max-w-44 truncate text-xs text-ivory-400">{user.email ?? 'No email'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className={cellClass}>
                                    <AccountType user={user} />
                                </td>
                                <td className={`${cellClass} tabular-nums`}>{formatNumber(user.gamesPlayed)}</td>
                                <td className={`${cellClass} tabular-nums`}>{formatNumber(user.gamesWon)}</td>
                                <td className={`${cellClass} tabular-nums`}>{formatNumber(user.betsPlaced)}</td>
                                <td className={`${cellClass} whitespace-nowrap tabular-nums`}>
                                    {formatNumber(user.chipsWon)} / {formatNumber(user.chipsLost)}
                                </td>
                                <td className={`${cellClass} tabular-nums`}>
                                    <Link href={route('admin.visits', { user: user.id })} className="underline-offset-2 hover:underline">
                                        {formatNumber(user.visits)}
                                    </Link>
                                </td>
                                <td className={`${cellClass} font-mono text-xs`}>{user.lastIp ?? '—'}</td>
                                <td className={`${cellClass} whitespace-nowrap text-ivory-400`}>{timeAgo(user.lastSeen)}</td>
                                <td className={`${cellClass} whitespace-nowrap text-ivory-400`}>{formatDate(user.joinedAt)}</td>
                            </tr>
                        ))}
                    </Table>
                )}
                <Pagination page={users} />
            </Section>
        </AdminLayout>
    );
}
