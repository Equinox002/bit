<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Bet;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\RoomMember;
use App\Models\User;
use App\Models\Visit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class OverviewController extends Controller
{
    private const RANGES = [7, 30, 90];

    private const ACTIVE_MINUTES = 5;

    private const PAGE_NAMES = [
        'home' => 'Home',
        'how-to-play' => 'How to Play',
        'pass-and-play' => 'Pass & Play',
        'play' => 'Play Now',
        'rooms.create' => 'Create Room',
        'rooms.show' => 'Game room',
        'join.index' => 'Join',
        'join.show' => 'Invite link',
        'login' => 'Log in',
        'register' => 'Register',
        'profile.edit' => 'Profile',
    ];

    public function __invoke(Request $request): Response
    {
        $days = in_array($request->integer('days'), self::RANGES, true) ? $request->integer('days') : 30;
        $timezone = config('admin.timezone');
        $today = now($timezone)->startOfDay();
        $since = $today->copy()->subDays($days - 1);
        $inRange = fn (): Builder => Visit::humans()->where('visited_on', '>=', $since->toDateString());

        return Inertia::render('Admin/Overview', [
            'days' => $days,
            'ranges' => self::RANGES,
            'stats' => $this->stats($today),
            'visitsByDay' => $this->visitsByDay($inRange(), $since, $today),
            'gamesByDay' => $this->gamesByDay($since, $today),
            'pages' => $this->pages($inRange()),
            'devices' => $this->breakdown($inRange(), 'device'),
            'browsers' => $this->breakdown($inRange(), 'browser'),
            'systems' => $this->breakdown($inRange(), 'os'),
            'referrers' => $this->breakdown($inRange()->whereNotNull('referrer'), 'referrer'),
            'addresses' => $this->addresses($inRange()),
            'recentVisits' => Visit::humans()->with('user:id,name,is_guest')->latest('id')->limit(8)->get()->map->toAdminArray(),
            'liveRooms' => $this->liveRooms(),
            'timezone' => $timezone,
        ]);
    }

    private function stats(Carbon $today): array
    {
        $on = fn (Carbon $day): Builder => Visit::humans()->where('visited_on', $day->toDateString());
        $yesterday = $today->copy()->subDay();

        return [
            'activeNow' => Visit::humans()->where('created_at', '>=', now()->subMinutes(self::ACTIVE_MINUTES))->distinct()->count('visitor_hash'),
            'activeMinutes' => self::ACTIVE_MINUTES,
            'visitorsToday' => $on($today)->distinct()->count('visitor_hash'),
            'visitorsYesterday' => $on($yesterday)->distinct()->count('visitor_hash'),
            'viewsToday' => $on($today)->count(),
            'viewsYesterday' => $on($yesterday)->count(),
            'accounts' => User::where('is_guest', false)->count(),
            'guests' => User::where('is_guest', true)->count(),
            'roomsPlaying' => GameRoom::where('status', GameRoom::PLAYING)->count(),
            'roomsLobby' => GameRoom::where('status', GameRoom::LOBBY)->count(),
            'playersSeated' => RoomMember::whereNull('left_at')
                ->whereNull('disconnected_at')
                ->whereHas('room', fn ($query) => $query->where('status', GameRoom::PLAYING))
                ->count(),
            'gamesFinished' => GameSession::whereNotNull('ended_at')->count(),
            'roomsTotal' => GameRoom::count(),
            'betsPlaced' => Bet::count(),
            'chipsBet' => (int) Bet::sum('amount'),
        ];
    }

    private function visitsByDay(Builder $visits, Carbon $since, Carbon $today): array
    {
        $rows = $visits
            ->selectRaw('visited_on as day, count(*) as views, count(distinct visitor_hash) as visitors')
            ->groupBy('visited_on')
            ->toBase()
            ->get()
            ->keyBy(fn ($row) => substr($row->day, 0, 10));

        return $this->eachDay($since, $today, fn (string $day) => [
            'date' => $day,
            'views' => (int) ($rows[$day]->views ?? 0),
            'visitors' => (int) ($rows[$day]->visitors ?? 0),
        ]);
    }

    private function gamesByDay(Carbon $since, Carbon $today): array
    {
        // Stored in the app's timezone, so converted both ways to count by the admin's calendar day.
        $counts = GameSession::where('started_at', '>=', $since->copy()->setTimezone(config('app.timezone')))
            ->pluck('started_at')
            ->countBy(fn (Carbon $startedAt) => $startedAt->copy()->setTimezone($today->timezone)->toDateString());

        return $this->eachDay($since, $today, fn (string $day) => ['date' => $day, 'games' => $counts[$day] ?? 0]);
    }

    private function eachDay(Carbon $since, Carbon $today, callable $row): array
    {
        $rows = [];

        for ($day = $since->copy(); $day->lte($today); $day->addDay()) {
            $rows[] = $row($day->toDateString());
        }

        return $rows;
    }

    private function pages(Builder $visits): array
    {
        return $visits
            ->selectRaw('route_name as label, count(*) as total')
            ->groupBy('route_name')
            ->orderByDesc('total')
            ->limit(7)
            ->toBase()
            ->get()
            ->map(fn ($row) => ['label' => self::PAGE_NAMES[$row->label] ?? $row->label ?? 'Other', 'total' => (int) $row->total])
            ->all();
    }

    /**
     * $column is always one of the fixed names passed above, never user input.
     */
    private function breakdown(Builder $visits, string $column): array
    {
        return $visits
            ->selectRaw("{$column} as label, count(*) as total")
            ->groupBy($column)
            ->orderByDesc('total')
            ->limit(6)
            ->toBase()
            ->get()
            ->map(fn ($row) => ['label' => $row->label, 'total' => (int) $row->total])
            ->all();
    }

    private function addresses(Builder $visits): array
    {
        return $visits
            ->selectRaw('ip, count(*) as total, max(created_at) as last_seen')
            ->groupBy('ip')
            ->orderByDesc('total')
            ->limit(6)
            ->toBase()
            ->get()
            ->map(fn ($row) => [
                'ip' => $row->ip,
                'total' => (int) $row->total,
                'lastSeen' => Carbon::parse($row->last_seen, config('app.timezone'))->toIso8601String(),
            ])
            ->all();
    }

    private function liveRooms(): array
    {
        return GameRoom::with('host:id,game_room_id,display_name')
            ->withCount('activeMembers')
            ->whereIn('status', [GameRoom::PLAYING, GameRoom::LOBBY])
            ->latest('updated_at')
            ->limit(6)
            ->get()
            ->map(fn (GameRoom $room) => [
                'code' => $room->code,
                'name' => $room->name,
                'status' => $room->status,
                'host' => $room->host?->display_name,
                'players' => $room->active_members_count,
                'updatedAt' => $room->updated_at->toIso8601String(),
            ])
            ->all();
    }
}
