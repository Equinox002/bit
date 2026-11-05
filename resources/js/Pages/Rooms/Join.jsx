import { Head, Link, useForm } from '@inertiajs/react';
import { Button, Panel, buttonClass } from '@/Components/Game/ui';
import { TextField } from '@/Components/Game/SettingsFields';
import { chips, multiplierLabel } from '@/game/format';
import SiteLayout from '@/Layouts/SiteLayout';

function CodeForm() {
    const form = useForm({ code: '' });

    return (
        <Panel className="p-6">
            <h1 className="mb-1 font-display text-2xl text-ivory-50">Join a room</h1>
            <p className="mb-4 text-sm text-ivory-400">Enter the code your friend shared with you.</p>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    form.post(route('join.lookup'));
                }}
                className="space-y-4"
            >
                <TextField label="Room code" name="code" value={form.data.code} onChange={(value) => form.setData('code', value.toUpperCase())} error={form.errors.code} maxLength={8} placeholder="HB7K92" autoFocus />
                <Button type="submit" className="w-full" disabled={form.processing || form.data.code.trim() === ''}>
                    Find Room
                </Button>
            </form>
        </Panel>
    );
}

function RoomDetails({ room, defaultName }) {
    const form = useForm({ name: defaultName ?? '' });
    const closedMessage = {
        playing: 'This game has already started and is not accepting new players.',
        finished: 'This game has ended.',
        closed: 'This room has closed.',
    }[room.status] ?? 'This room is full.';

    return (
        <Panel className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-400">Room {room.code}</p>
            <h1 className="mb-4 mt-1 break-words font-display text-2xl text-ivory-50">{room.name}</h1>

            <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
                {[
                    ['Players', `${room.playerCount} of ${room.maxPlayers}`],
                    ['Starting chips', chips(room.startingChips)],
                    ['Contribution', chips(room.contribution)],
                    ['Payout', multiplierLabel(room.multiplier)],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-ink-800 px-3 py-2">
                        <dt className="text-xs text-ivory-400">{label}</dt>
                        <dd className="font-medium text-ivory-50">{value}</dd>
                    </div>
                ))}
            </dl>

            {room.players.length > 0 && (
                <p className="mb-4 break-words text-sm text-ivory-300">At the table: {room.players.join(', ')}</p>
            )}

            {room.joinable ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.post(route('join.store', room.code));
                    }}
                    className="space-y-4"
                >
                    <TextField label="Your display name" name="name" value={form.data.name} onChange={(value) => form.setData('name', value)} error={form.errors.name} maxLength={24} autoFocus />
                    <Button type="submit" className="w-full" disabled={form.processing || form.data.name.trim() === ''}>
                        Take a Seat
                    </Button>
                </form>
            ) : (
                <div>
                    <p className="mb-3 rounded-lg border border-loss-400/30 bg-loss-600/10 px-3 py-2 text-sm text-loss-300">{closedMessage}</p>
                    <Link href={route('home')} className={buttonClass('secondary', 'w-full')}>Back to Home</Link>
                </div>
            )}
        </Panel>
    );
}

export default function Join({ room, defaultName }) {
    return (
        <SiteLayout>
            <Head title={room ? `Join ${room.name}` : 'Join a Room'} />
            <div className="mx-auto max-w-md py-6">
                {room ? <RoomDetails room={room} defaultName={defaultName} /> : <CodeForm />}
            </div>
        </SiteLayout>
    );
}
