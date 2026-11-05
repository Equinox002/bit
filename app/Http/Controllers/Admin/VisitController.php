<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Visit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class VisitController extends Controller
{
    private const DEVICES = ['desktop', 'mobile', 'tablet', Visit::BOT];

    private const RANGES = [1, 7, 30, 90];

    public function __invoke(Request $request): Response
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'device' => ['nullable', Rule::in(self::DEVICES)],
            'days' => ['nullable', 'integer', Rule::in(self::RANGES)],
            'user' => ['nullable', 'integer'],
        ]);

        $matching = fn (): Builder => $this->filtered($filters);

        return Inertia::render('Admin/Visits', [
            'filters' => $filters,
            'visits' => $matching()
                ->with('user:id,name,is_guest')
                ->latest('id')
                ->paginate(25)
                ->withQueryString()
                ->through(fn (Visit $visit) => $visit->toAdminArray()),
            'summary' => [
                'visitors' => $matching()->distinct()->count('visitor_hash'),
                'addresses' => $matching()->distinct()->count('ip'),
            ],
        ]);
    }

    private function filtered(array $filters): Builder
    {
        $device = $filters['device'] ?? null;

        return Visit::query()
            // Bots would drown out people, so they only appear when asked for.
            ->when($device === null, fn (Builder $query) => $query->humans())
            ->when($device !== null, fn (Builder $query) => $query->where('device', $device))
            ->when($filters['user'] ?? null, fn (Builder $query, int $user) => $query->where('user_id', $user))
            ->when($filters['days'] ?? null, function (Builder $query, int $days) {
                $query->where('visited_on', '>=', now(config('admin.timezone'))->subDays($days - 1)->toDateString());
            })
            ->when($filters['q'] ?? null, function (Builder $query, string $search) {
                $like = '%'.addcslashes($search, '%_\\').'%';

                $query->where(function (Builder $inner) use ($like) {
                    $inner->where('ip', 'like', $like)
                        ->orWhere('path', 'like', $like)
                        ->orWhere('user_agent', 'like', $like)
                        ->orWhere('referrer', 'like', $like)
                        ->orWhereHas('user', fn (Builder $user) => $user->where('name', 'like', $like)->orWhere('email', 'like', $like));
                });
            });
    }
}
