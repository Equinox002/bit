import SiteLayout from '@/Layouts/SiteLayout';
import DeleteUserForm from './Partials/DeleteUserForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';
import { Head } from '@inertiajs/react';

export default function Edit({ mustVerifyEmail, status }) {
    return (
        <SiteLayout>
            <Head title="Profile" />

            <div className="mx-auto max-w-2xl space-y-4 py-4">
                <h1 className="font-display text-3xl font-bold text-ivory-50">Profile</h1>

                <div className="rounded-2xl bg-ivory-50 p-4 text-ink-900 shadow-card sm:p-8">
                    <UpdateProfileInformationForm
                        mustVerifyEmail={mustVerifyEmail}
                        status={status}
                        className="max-w-xl"
                    />
                </div>

                <div className="rounded-2xl bg-ivory-50 p-4 text-ink-900 shadow-card sm:p-8">
                    <UpdatePasswordForm className="max-w-xl" />
                </div>

                <div className="rounded-2xl bg-ivory-50 p-4 text-ink-900 shadow-card sm:p-8">
                    <DeleteUserForm className="max-w-xl" />
                </div>
            </div>
        </SiteLayout>
    );
}
