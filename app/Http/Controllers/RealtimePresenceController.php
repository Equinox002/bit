<?php

namespace App\Http\Controllers;

use App\Models\GameRoom;
use App\Services\GameService;
use App\Services\RealtimeHub;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Connection changes reported by the Socket.IO relay. Only the relay holds the shared secret.
 */
class RealtimePresenceController extends Controller
{
    public function __invoke(Request $request, RealtimeHub $hub, GameService $game): JsonResponse
    {
        abort_unless($hub->verifySecret($request->header('X-Realtime-Secret')), 403);

        $data = $request->validate([
            'room' => ['required', 'string', 'max:8'],
            'member' => ['required', 'integer'],
            'connected' => ['required', 'boolean'],
        ]);

        $room = GameRoom::where('code', $data['room'])->firstOrFail();
        $game->setPresence($room, $data['member'], $data['connected']);

        return response()->json(['ok' => true]);
    }
}
