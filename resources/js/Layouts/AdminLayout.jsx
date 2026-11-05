import { Head, Link, usePage } from '@inertiajs/react';
import { Activity, DoorOpen, ExternalLink, LayoutDashboard, LogOut, Users } from 'lucide-react';
import { Avatar, Logo } from '@/Components/Game/ui';
import { GAME_NAME } from '@/game/brand';

const NAVIGATION = [
    { name: 'admin.overview', label: 'Overview', icon: LayoutDashboard },
    { name: 'admin.visits', label: 'Visits', icon: Activity },
    { name: 'admin.users', label: 'Players', icon: Users },
    { name: 'admin.rooms', label: 'Rooms', icon: DoorOpen },
];

const footerLink = 'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-ivory-300 transition hover:bg-white/5 hover:text-ivory-50';

export default function AdminLayout({ title, children }) {
    const { auth } = usePage().props;

    return (
        <div className="min-h-dvh bg-gradient-to-b from-felt-950 via-ink-950 to-ink-950 lg:flex">
            <Head title={title} />
            <aside className="border-b border-white/10 bg-ink-950/60 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between gap-3 px-4 pt-3 lg:pt-5">
                    <Link href={route('admin.overview')} className="flex items-center gap-2">
                        <Logo />
                        <span className="min-w-0">
                            <span className="block font-display text-lg leading-tight text-ivory-50">{GAME_NAME}</span>
                            <span className="block text-xs uppercase tracking-wider text-gold-400">Admin</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-1 lg:hidden">
                        <Link href={route('home')} aria-label="View site" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ivory-300 hover:bg-white/5">
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </Link>
                        <Link href={route('logout')} method="post" as="button" aria-label="Log out" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ivory-300 hover:bg-white/5">
                            <LogOut className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </div>
                </div>

                <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 py-2 lg:mt-6 lg:flex-1 lg:flex-col lg:overflow-visible lg:py-0">
                    {NAVIGATION.map(({ name, label, icon: Icon }) => {
                        const current = route().current(name);

                        return (
                            <Link
                                key={name}
                                href={route(name)}
                                aria-current={current ? 'page' : undefined}
                                className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm transition lg:gap-2.5 lg:px-3 ${
                                    current ? 'bg-gold-500/10 font-medium text-gold-200 ring-1 ring-inset ring-gold-500/30' : 'text-ivory-300 hover:bg-white/5 hover:text-ivory-50'
                                }`}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="hidden border-t border-white/10 p-3 lg:block">
                    <div className="mb-2 flex items-center gap-2.5 px-3 py-2">
                        <Avatar name={auth.user.name} size="sm" />
                        <span className="min-w-0 truncate text-sm text-ivory-100">{auth.user.name}</span>
                    </div>
                    <Link href={route('home')} className={footerLink}>
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        View site
                    </Link>
                    <Link href={route('logout')} method="post" as="button" className={footerLink}>
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Log out
                    </Link>
                </div>
            </aside>
            <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
    );
}
