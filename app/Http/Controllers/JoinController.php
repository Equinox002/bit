<?php

namespace App\Http\Controllers;

use App\Game\GameRuleException;
use App\Models\GameRoom;
use App\Services\PlayerIdentity;
use App\Services\RoomService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class JoinController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Rooms/Join', ['room' => null]);
    }

    /**
     * Look up a code typed into the join form.
     */
    public function lookup(Request $request): RedirectResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:8']]);
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $data['code']));

        if (! GameRoom::where('code', $code)->exists()) {
            throw ValidationException::withMessages(['code' => 'No room uses that code. Check it and try again.']);
        }

        return redirect()->route('join.show', $code);
    }

    public function show(Request $request, string $code): Response|RedirectResponse
    {
        $room = GameRoom::where('code', strtoupper($code))->first();

        if ($room === null) {
            return redirect()->route('join.index');
        }

        if ($room->memberFor($request->user()) !== null) {
            return redirect()->route('rooms.show', $room->code);
        }

        $rules = $room->rules();
        $count = $room->activeMembers()->count();

        return Inertia::render('Rooms/Join', [
            'room' => [
                'code' => $room->code,
                'name' => $room->name,
                'status' => $room->status,
                'players' => $room->activeMembers()->pluck('display_name'),
                'playerCount' => $count,
                'maxPlayers' => $rules->maxPlayers,
                'startingChips' => $rules->startingChips,
                'contribution' => $rules->contribution,
                'minBet' => $rules->minBet,
                'multiplier' => $rules->multiplier,
                'joinable' => $count < $rules->maxPlayers && match ($room->status) {
                    GameRoom::LOBBY => true,
                    GameRoom::PLAYING => $rules->allowLateJoin,
                    default => false,
                },
            ],
            'defaultName' => $request->user()?->name,
        ]);
    }

    public function store(Request $request, string $code, RoomService $rooms, PlayerIdentity $identity): RedirectResponse
    {
        $room = GameRoom::where('code', strtoupper($code))->firstOrFail();
        $data = $request->validate(['name' => RoomController::NAME_RULES]);
        $name = trim($data['name']);

        try {
            // Checked first so a rejected join doesn't create a guest account for nothing.
            if ($room->memberFor($request->user()) === null) {
                $rooms->assertCanJoin($room, $name);
            }

            $rooms->join($room, $identity->resolve($request, $name), $name);
        } catch (GameRuleException $exception) {
            throw ValidationException::withMessages(['name' => $exception->getMessage()]);
        }

        return redirect()->route('rooms.show', $room->code);
    }
}
