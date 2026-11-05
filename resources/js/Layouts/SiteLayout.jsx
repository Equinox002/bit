import { Link, usePage } from '@inertiajs/react';
import { Logo, buttonClass } from '@/Components/Game/ui';
import { GAME_NAME } from '@/game/brand';

export default function SiteLayout({ children }) {
    const { auth } = usePage().props;
    const user = auth.user;

    return (
        <div className="flex min-h-dvh flex-col overflow-x-hidden bg-gradient-to-b from-felt-950 via-ink-950 to-ink-950">
            <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
                <Link href={route('home')} className="flex items-center gap-2">
                    <Logo />
                    <span className="font-display text-xl text-ivory-50">{GAME_NAME}</span>
                </Link>
                <nav className="flex items-center gap-1 text-sm">
                    <Link href={route('how-to-play')} className={buttonClass('ghost', 'hidden sm:inline-flex')}>
                        How to Play
                    </Link>
                    {user && !user.is_guest ? (
                        <>
                            {user.is_admin && (
                                <Link href={route('admin.overview')} className={buttonClass('ghost')}>
                                    Admin
                                </Link>
                            )}
                            <Link href={route('profile.edit')} className={buttonClass('ghost', 'max-w-40 truncate')}>
                                {user.name}
                            </Link>
                            <Link href={route('logout')} method="post" as="button" className={buttonClass('ghost')}>
                                Log out
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link href={route('login')} className={buttonClass('ghost')}>
                                Log in
                            </Link>
                            <Link href={route('register')} className={buttonClass('secondary')}>
                                Register
                            </Link>
                        </>
                    )}
                </nav>
            </header>
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 sm:px-6">{children}</main>
        </div>
    );
}
