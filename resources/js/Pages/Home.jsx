import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowRight, BookOpen, History, Play, Plus, Smartphone, Trophy, UserRound, Users } from 'lucide-react';
import { useState } from 'react';
import { router } from '@inertiajs/react';
import PlayingCard from '@/Components/Game/PlayingCard';
import { ChipStack } from '@/Components/Game/PokerChip';
import { Avatar, Button, Panel, buttonClass } from '@/Components/Game/ui';
import { GAME_NAME, TAGLINE } from '@/game/brand';
import { chips } from '@/game/format';
import SiteLayout from '@/Layouts/SiteLayout';

function HeroTable() {
    return (
        <div aria-hidden="true" className="relative mx-auto aspect-[5/4] w-full max-w-md">
            <div className="table-rail absolute inset-[6%]">
                <div className="table-felt" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 sm:gap-3">
                    <PlayingCard card="AH" size="md" className="-rotate-6" />
                    <PlayingCard card="3D" size="lg" className="z-10 -translate-y-2 ring-2 ring-gold-400" />
                    <PlayingCard card="5C" size="md" className="rotate-6" />
                </div>
            </div>
            <div className="absolute left-1/2 top-[11%] -translate-x-1/2 rounded-full border border-gold-600/50 bg-ink-950/70 px-4 py-1 text-xs font-semibold tracking-wide text-gold-300">
                In range. Winners paid.
            </div>
            <div className="absolute bottom-[14%] left-[15%]">
                <ChipStack amount={680} spread={9} size={36} maxColumns={2} maxPerColumn={7} />
            </div>
            <div className="absolute bottom-[14%] right-[15%]">
                <ChipStack amount={3400} spread={8} size={36} maxColumns={2} maxPerColumn={7} />
            </div>
        </div>
    );
}

function JoinByCode() {
    const [code, setCode] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const submit = (event) => {
        event.preventDefault();
        setBusy(true);
        router.post(route('join.lookup'), { code }, {
            onError: (errors) => setError(errors.code),
            onFinish: () => setBusy(false),
        });
    };

    return (
        <form onSubmit={submit}>
            <label htmlFor="home-room-code" className="mb-1 block text-sm font-medium text-ivory-200">
                Have a room code?
            </label>
            <div className="flex gap-2">
                <input
                    id="home-room-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="HB7K92"
                    autoCapitalize="characters"
                    autoComplete="off"
                    className="min-h-11 w-full min-w-0 rounded-xl border border-white/15 bg-ink-800 px-3 font-semibold uppercase tracking-[0.2em] text-ivory-50 placeholder:text-ivory-400/50 focus:border-gold-400 focus:ring-gold-400"
                />
                <Button type="submit" variant="secondary" disabled={busy || code.trim() === ''} className="shrink-0">
                    Join Room
                </Button>
            </div>
            {error && <p className="mt-1 text-sm text-loss-300">{error}</p>}
        </form>
    );
}

function Profile({ statistics }) {
    const { auth } = usePage().props;
    const user = auth.user;
    const winRate = statistics?.bets_placed ? Math.round((statistics.bets_won / statistics.bets_placed) * 100) : null;

    return (
        <Panel className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gold-400">
                <UserRound className="h-4 w-4" aria-hidden="true" /> Player profile
            </h2>
            {user ? (
                <div className="mb-4 flex items-center gap-3">
                    <Avatar name={user.name} hue={(user.id * 67) % 360} />
                    <div className="min-w-0">
                        <div className="truncate font-medium text-ivory-50">{user.name}</div>
                        <div className="text-xs text-ivory-400">{user.is_guest ? 'Playing as a guest' : 'Registered player'}</div>
                    </div>
                </div>
            ) : (
                <p className="mb-4 text-sm text-ivory-300">Play with just a name. Register any time to keep your stats on every device.</p>
            )}
            {statistics ? (
                <dl className="grid grid-cols-3 gap-2 text-center">
                    {[
                        ['Games', statistics.games_played],
                        ['Won', statistics.games_won],
                        ['Bets won', winRate === null ? '–' : `${winRate}%`],
                    ].map(([label, value]) => (
                        <div key={label} className="rounded-lg bg-ink-800 p-2">
                            <dd className="text-lg font-semibold text-ivory-50">{value}</dd>
                            <dt className="text-xs text-ivory-400">{label}</dt>
                        </div>
                    ))}
                </dl>
            ) : (
                user && <p className="text-sm text-ivory-400">Your stats appear after your first bet.</p>
            )}
            {user?.is_guest && (
                <Link href={route('register')} className="mt-3 inline-block text-sm text-gold-300 underline underline-offset-2">
                    Save your stats with an account
                </Link>
            )}
        </Panel>
    );
}

function RecentGames({ games }) {
    return (
        <Panel className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gold-400">
                <History className="h-4 w-4" aria-hidden="true" /> Recent games
            </h2>
            {games.length === 0 ? (
                <p className="text-sm text-ivory-400">Finished games will show up here.</p>
            ) : (
                <ul className="divide-y divide-white/5">
                    {games.map((game) => (
                        <li key={game.code}>
                            <Link href={route('rooms.show', game.code)} className="flex items-center justify-between gap-3 py-2 hover:text-gold-300">
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">{game.name}</span>
                                    <span className="text-xs text-ivory-400">{game.players} players</span>
                                </span>
                                <span className="shrink-0 text-right text-sm">
                                    {game.place === 1 && <Trophy className="mr-1 inline h-3.5 w-3.5 text-gold-400" aria-label="Winner" />}
                                    {game.chips === null ? 'Left early' : `${chips(game.chips)} chips`}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}

export default function Home({ statistics, recentGames, activeRooms, openRooms }) {
    return (
        <SiteLayout>
            <Head title="Play" />

            {activeRooms.length > 0 && (
                <div className="mb-4 space-y-2">
                    {activeRooms.map((room) => (
                        <Link
                            key={room.code}
                            href={route('rooms.show', room.code)}
                            className="flex items-center justify-between gap-3 rounded-xl border border-gold-500/40 bg-gold-500/10 px-4 py-3 text-sm hover:bg-gold-500/20"
                        >
                            <span className="min-w-0 truncate">
                                {room.status === 'playing' ? 'Game in progress' : 'Waiting in lobby'}: <strong>{room.name}</strong>
                            </span>
                            <span className="flex shrink-0 items-center gap-1 font-semibold text-gold-300">
                                Rejoin <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </span>
                        </Link>
                    ))}
                </div>
            )}

            <section className="grid items-center gap-8 py-4 md:grid-cols-2 md:py-10">
                <div className="order-2 md:order-1">
                    <h1 className="font-display text-4xl font-bold leading-tight text-ivory-50 sm:text-5xl">{GAME_NAME}</h1>
                    <p className="mt-3 text-lg text-ivory-200">{TAGLINE}</p>
                    <p className="mt-2 text-sm text-ivory-400">
                        Bet on your range, invite your friends to back it, and fight over the pot. Virtual chips only.
                    </p>

                    <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                        <Link href={route('play')} className={buttonClass('primary', 'text-base sm:px-7')}>
                            <Play className="h-4 w-4" aria-hidden="true" /> Play Now
                        </Link>
                        <Link href={route('rooms.create')} className={buttonClass('secondary', 'text-base')}>
                            <Plus className="h-4 w-4" aria-hidden="true" /> Create Room
                        </Link>
                        <Link href={route('pass-and-play')} className={buttonClass('secondary', 'text-base')}>
                            <Smartphone className="h-4 w-4" aria-hidden="true" /> Pass &amp; Play
                        </Link>
                    </div>

                    {openRooms > 0 && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-ivory-400">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            {openRooms} open {openRooms === 1 ? 'table is' : 'tables are'} waiting for players
                        </p>
                    )}

                    <div className="mt-6 max-w-sm">
                        <JoinByCode />
                    </div>
                </div>
                <div className="order-1 md:order-2">
                    <HeroTable />
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
                <Panel className="p-5">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gold-400">
                        <BookOpen className="h-4 w-4" aria-hidden="true" /> Game rules
                    </h2>
                    <ol className="list-inside list-decimal space-y-1 text-sm text-ivory-200">
                        <li>You hold two cards. Your range is the ranks between them.</li>
                        <li>Bet on it, then friends may back it too.</li>
                        <li>One card is drawn. In range pays from the pot; out of range feeds it.</li>
                    </ol>
                    <Link href={route('how-to-play')} className="mt-3 inline-flex items-center gap-1 text-sm text-gold-300 underline-offset-2 hover:underline">
                        How to Play <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                </Panel>
                <RecentGames games={recentGames} />
                <Profile statistics={statistics} />
            </section>
        </SiteLayout>
    );
}
