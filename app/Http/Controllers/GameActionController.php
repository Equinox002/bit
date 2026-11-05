<?php

namespace App\Http\Controllers;

use App\Game\GameRuleException;
use App\Models\GameRoom;
use App\Services\GameService;
use App\Services\RoomPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class GameActionController extends Controller
{
    public function act(Request $request, GameRoom $room, GameService $game, RoomPresenter $presenter): JsonResponse
    {
        $member = $room->memberFor($request->user());
        abort_if($member === null, 403, 'You are not in this room.');

        $data = $request->validate([
            'action' => ['required', Rule::in(['bet', 'pass', 'reset', 'continue', 'end'])],
            'amount' => ['nullable', 'required_if:action,bet', 'integer', 'min:1'],
            'key' => ['required', 'uuid'],
        ]);

        try {
            $applied = $game->act($room, $member, $data['action'], $data['amount'] ?? null, $data['key']);
        } catch (GameRuleException $exception) {
            return response()->json(['message' => $exception->getMessage(), 'reason' => $exception->reason], 422);
        }

        return response()->json([...$presenter->forMember($room, $member), 'duplicate' => ! $applied]);
    }

    /**
     * Called by clients when a deadline passes and periodically while the page is open.
     */
    public function heartbeat(Request $request, GameRoom $room, GameService $game): JsonResponse
    {
        $member = $room->memberFor($request->user());
        abort_if($member === null, 403, 'You are not in this room.');

        $game->heartbeat($room, $member);

        return response()->json(['version' => (int) $room->fresh()->version]);
    }
}
