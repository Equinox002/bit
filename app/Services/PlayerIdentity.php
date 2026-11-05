<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Friends can play with just a name. A guest is a real user row with an unusable email and a
 * random password, and a long-lived cookie brings them back to their seat after a disconnect.
 */
class PlayerIdentity
{
    public function resolve(Request $request, string $displayName): User
    {
        if ($request->user() !== null) {
            return $request->user();
        }

        $uuid = (string) Str::uuid();
        $guest = User::forceCreate([
            'name' => $displayName,
            'email' => "guest-{$uuid}@guest.invalid",
            'password' => Hash::make(Str::random(40)),
            'is_guest' => true,
        ]);

        Auth::login($guest, true);
        $request->session()->regenerate();

        return $guest;
    }
}
