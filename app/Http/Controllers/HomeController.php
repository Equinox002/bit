<?php

namespace App\Http\Controllers;

use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\PlayerStatistic;
use App\Models\RoomMember;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class HomeController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();

        return Inertia::render('Home', [
            'statistics' => $user === null ? null : PlayerStatistic::where('user_id', $user->id)->first(),
            'recentGames' => $user === null ? [] : $this->recentGames($user->id),
            'activeRooms' => $user === null ? [] : $this->activeRooms($user->id),
            'openRooms' => GameRoom::where('status', GameRoom::LOBBY)->where('is_private', false)->count(),
        ]);
    }

    private function recentGames(int $userId): array
    {
        $members = RoomMember::with('room')
            ->where('user_id', $userId)
            ->whereHas('room', fn ($query) => $query->where('status', GameRoom::FINISHED))
            ->latest()
            ->limit(5)
            ->get();

        return $members->map(function (RoomMember $member) {
            $final = GameSession::where('game_room_id', $member->game_room_id)->latest('id')->value('final');
            $standings = $final['standings'] ?? [];
            $position = array_search($member->id, array_column($standings, 'playerId'), true);

            return [
                'code' => $member->room->code,
                'name' => $member->room->name,
                'players' => count($standings),
                'place' => $position === false ? null : $position + 1,
                'chips' => $position === false ? null : $standings[$position]['chips'],
                'endedAt' => $member->room->updated_at->toIso8601String(),
            ];
        })->all();
    }

    private function activeRooms(int $userId): array
    {
        return RoomMember::with('room')
            ->where('user_id', $userId)
            ->whereNull('left_at')
            ->whereHas('room', fn ($query) => $query->whereIn('status', [GameRoom::LOBBY, GameRoom::PLAYING]))
            ->latest()
            ->limit(3)
            ->get()
            ->map(fn (RoomMember $member) => [
                'code' => $member->room->code,
                'name' => $member->room->name,
                'status' => $member->room->status,
            ])
            ->all();
    }
}
