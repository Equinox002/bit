import ApplicationLogo from '@/Components/ApplicationLogo';
import { Link } from '@inertiajs/react';

export default function Guest({ children }) {
    return (
        <div className="min-h-screen flex flex-col sm:justify-center items-center pt-6 sm:pt-0 bg-gradient-to-b from-felt-950 to-ink-950">
            <div>
                <Link href="/" aria-label="Home">
                    <ApplicationLogo className="w-20 h-20" />
                </Link>
            </div>

            <div className="w-full sm:max-w-md mt-6 px-6 py-4 bg-ivory-50 text-ink-900 shadow-md overflow-hidden sm:rounded-2xl">
                {children}
            </div>
        </div>
    );
}
