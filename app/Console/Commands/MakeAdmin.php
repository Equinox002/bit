<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

class MakeAdmin extends Command
{
    protected $signature = 'admin:make {email : The account to give admin access} {--revoke : Remove admin access instead}';

    protected $description = 'Give an account access to /admin, creating the account if it does not exist';

    public function handle(): int
    {
        $email = (string) $this->argument('email');
        $user = User::where('email', $email)->first();

        if ($this->option('revoke')) {
            return $this->revoke($user, $email);
        }

        if ($user?->is_guest) {
            $this->error('Guest players cannot be admins. Register an account first.');

            return self::FAILURE;
        }

        if ($user === null) {
            $user = $this->createAccount($email);

            if ($user === null) {
                return self::FAILURE;
            }
        }

        // Set directly because is_admin is deliberately not mass assignable.
        $user->forceFill(['is_admin' => true])->save();
        $this->info("{$user->email} can now open /admin.");

        return self::SUCCESS;
    }

    private function revoke(?User $user, string $email): int
    {
        if ($user === null) {
            $this->error("No account uses {$email}.");

            return self::FAILURE;
        }

        $user->forceFill(['is_admin' => false])->save();
        $this->info("{$user->email} can no longer open /admin.");

        return self::SUCCESS;
    }

    private function createAccount(string $email): ?User
    {
        $this->line("No account uses {$email}, so a new one will be created.");

        $data = [
            'email' => $email,
            'name' => $this->ask('Name'),
            'password' => $this->secret('Password (at least 8 characters)'),
        ];

        $validator = Validator::make($data, [
            'email' => ['required', 'email', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'password' => ['required', Password::defaults()],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return null;
        }

        return User::forceCreate([
            'name' => $data['name'],
            'email' => $email,
            'password' => Hash::make($data['password']),
            'email_verified_at' => now(),
        ]);
    }
}
