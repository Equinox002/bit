<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\GameRoom;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class RoomController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:60'],
            'status' => ['nullable', Rule::in([GameRoom::LOBBY, GameRoom::PLAYING, GameRoom::FINISHED, GameRoom::CLOSED])],
        ]);

        $rooms = GameRoom::query()
            ->with('host:id,game_room_id,display_name')
            ->withCount(['activeMembers', 'sessions'])
            ->when($filters['status'] ?? null, fn (Builder $query, string $status) => $query->where('status', $status))
            ->when($filters['q'] ?? null, function (Builder $query, string $search) {
                $like = '%'.addcslashes($search, '%_\\').'%';

                $query->where(fn (Builder $inner) => $inner->where('code', 'like', $like)->orWhere('name', 'like', $like));
            })
            ->latest('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (GameRoom $room) => [
                'id' => $room->id,
                'code' => $room->code,
                'name' => $room->name,
                'status' => $room->status,
                'isPrivate' => $room->is_private,
                'host' => $room->host?->display_name,
                'players' => $room->active_members_count,
                'games' => $room->sessions_count,
                'createdAt' => $room->created_at?->toIso8601String(),
                'updatedAt' => $room->updated_at?->toIso8601String(),
            ]);

        return Inertia::render('Admin/Rooms', ['filters' => $filters, 'rooms' => $rooms]);
    }
}
