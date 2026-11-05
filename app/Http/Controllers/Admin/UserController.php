<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'type' => ['nullable', Rule::in(['registered', 'guest', 'admin'])],
        ]);

        $users = User::query()
            ->select(['id', 'name', 'email', 'is_guest', 'is_admin', 'created_at'])
            ->with(['statistics', 'lastVisit'])
            ->withCount('visits')
            ->when($filters['type'] ?? null, function (Builder $query, string $type) {
                match ($type) {
                    'registered' => $query->where('is_guest', false),
                    'guest' => $query->where('is_guest', true),
                    'admin' => $query->where('is_admin', true),
                };
            })
            ->when($filters['q'] ?? null, function (Builder $query, string $search) {
                $like = '%'.addcslashes($search, '%_\\').'%';

                $query->where(fn (Builder $inner) => $inner->where('name', 'like', $like)->orWhere('email', 'like', $like));
            })
            ->latest('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                // Guests only have a generated placeholder address.
                'email' => $user->is_guest ? null : $user->email,
                'isGuest' => (bool) $user->is_guest,
                'isAdmin' => $user->is_admin,
                'gamesPlayed' => $user->statistics?->games_played ?? 0,
                'gamesWon' => $user->statistics?->games_won ?? 0,
                'betsPlaced' => $user->statistics?->bets_placed ?? 0,
                'chipsWon' => (int) ($user->statistics?->chips_won ?? 0),
                'chipsLost' => (int) ($user->statistics?->chips_lost ?? 0),
                'visits' => $user->visits_count,
                'lastIp' => $user->lastVisit?->ip,
                'lastSeen' => $user->lastVisit?->created_at?->toIso8601String(),
                'joinedAt' => $user->created_at?->toIso8601String(),
            ]);

        return Inertia::render('Admin/Users', ['filters' => $filters, 'users' => $users]);
    }
}
