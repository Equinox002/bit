<?php

namespace App\Services;

use App\Game\StateView;
use App\Models\GameRoom;
use App\Models\RoomMember;

/**
 * Builds what one member's browser receives. This is the only route game state takes to a client.
 */
class RoomPresenter
{
    public function __construct(private readonly RealtimeHub $hub)
    {
    }

    public function forMember(GameRoom $room, RoomMember $viewer): array
    {
        $room = $room->fresh(['settingsRecord']);
        $rules = $room->rules();
        $members = $room->members()->orderBy('seat')->get();
        $session = $room->status === GameRoom::LOBBY ? null : $room->sessions()->latest('id')->first();

        return [
            'version' => (int) $room->version,
            'code' => $room->code,
            'name' => $room->name,
            'status' => $room->status,
            'isPrivate' => $room->is_private,
            'inviteUrl' => route('join.show', $room->code),
            'preset' => $room->settingsRecord->preset,
            'settings' => $rules->toArray(),
            'you' => $viewer->id,
            'isHost' => (bool) $members->firstWhere('id', $viewer->id)?->is_host,
            'members' => $members
                ->filter(fn (RoomMember $m) => $m->left_at === null)
                ->values()
                ->map(fn (RoomMember $m) => [
                    'id' => $m->id,
                    'name' => $m->display_name,
                    'seat' => $m->seat,
                    'hue' => $m->avatar_hue,
                    'isHost' => $m->is_host,
                    'connected' => $m->isConnected(),
                ]),
            'game' => $session === null
                ? null
                : StateView::forViewer($session->state, $rules, $viewer->id, now()->timestamp),
            'realtime' => [
                'url' => config('services.realtime.public_url'),
                'port' => (int) config('services.realtime.port'),
                'enabled' => ! empty(config('services.realtime.url')),
                'token' => $this->hub->token($room->code, $viewer->id),
            ],
        ];
    }
}
