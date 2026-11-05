<?php

namespace App\Http\Controllers;

use App\Game\GameRuleException;
use App\Game\GameSettings;
use App\Game\InvalidSettingsException;
use App\Models\GameRoom;
use App\Services\GameService;
use App\Services\PlayerIdentity;
use App\Services\RoomPresenter;
use App\Services\RoomService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class RoomController extends Controller
{
    public const NAME_RULES = ['required', 'string', 'min:1', 'max:24', 'not_regex:/[\x00-\x1F\x7F]/'];

    public function create(Request $request): Response
    {
        return Inertia::render('Rooms/Create', [
            'presets' => GameSettings::presetValues(),
            'maxSeats' => GameSettings::MAX_SEATS,
            'defaultName' => $request->user()?->name,
            'notice' => session('notice'),
        ]);
    }

    public function store(Request $request, RoomService $rooms, PlayerIdentity $identity): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60', 'not_regex:/[\x00-\x1F\x7F]/'],
            'hostName' => self::NAME_RULES,
            'isPrivate' => ['required', 'boolean'],
            'preset' => ['required', Rule::in(['quick', 'classic', 'custom'])],
            'settings' => ['array'],
        ]);

        $rules = $this->parseRules($data['preset'], $data['settings'] ?? []);
        $user = $identity->resolve($request, trim($data['hostName']));
        $room = $rooms->create($user, trim($data['name']), trim($data['hostName']), $data['isPrivate'], $data['preset'], $rules);

        return redirect()->route('rooms.show', $room->code);
    }

    /**
     * "Play Now": join the oldest open public table, or start one.
     */
    public function play(Request $request): RedirectResponse
    {
        $rooms = GameRoom::where('status', GameRoom::LOBBY)->where('is_private', false)->oldest()->limit(20)->get();

        foreach ($rooms as $room) {
            if ($room->activeMembers()->count() < $room->rules()->maxPlayers) {
                return redirect()->route('join.show', $room->code);
            }
        }

        return redirect()->route('rooms.create')->with('notice', 'No open tables right now, so start one and invite your friends.');
    }

    public function show(Request $request, GameRoom $room, RoomPresenter $presenter): Response|RedirectResponse
    {
        $member = $room->memberFor($request->user());

        if ($member === null) {
            return redirect()->route('join.show', $room->code);
        }

        return Inertia::render('Rooms/Room', [
            'initial' => $presenter->forMember($room, $member),
            'presets' => GameSettings::presetValues(),
        ]);
    }

    public function state(Request $request, GameRoom $room, RoomPresenter $presenter): JsonResponse
    {
        return response()->json($presenter->forMember($room, $this->memberOrFail($request, $room)));
    }

    public function updateSettings(Request $request, GameRoom $room, RoomService $rooms, RoomPresenter $presenter): JsonResponse
    {
        $member = $this->memberOrFail($request, $room);
        $data = $request->validate([
            'preset' => ['required', Rule::in(['quick', 'classic', 'custom'])],
            'settings' => ['array'],
        ]);

        return $this->guarded(function () use ($rooms, $room, $member, $data, $presenter) {
            $rooms->updateSettings($room, $member, $data['preset'], $this->parseRules($data['preset'], $data['settings'] ?? []));

            return $presenter->forMember($room, $member);
        });
    }

    public function start(Request $request, GameRoom $room, GameService $game, RoomPresenter $presenter): JsonResponse
    {
        $member = $this->memberOrFail($request, $room);

        return $this->guarded(function () use ($game, $room, $member, $presenter) {
            $game->start($room, $member);

            return $presenter->forMember($room, $member);
        });
    }

    public function leave(Request $request, GameRoom $room, RoomService $rooms): JsonResponse
    {
        $rooms->leave($room, $this->memberOrFail($request, $room));

        return response()->json(['left' => true]);
    }

    private function parseRules(string $preset, array $settings): GameSettings
    {
        try {
            return GameSettings::preset($preset, $settings);
        } catch (InvalidSettingsException $exception) {
            throw ValidationException::withMessages(
                collect($exception->errors)->mapWithKeys(fn ($message, $field) => ["settings.{$field}" => $message])->all(),
            );
        }
    }

    private function memberOrFail(Request $request, GameRoom $room)
    {
        $member = $room->memberFor($request->user());
        abort_if($member === null, 403, 'You are not in this room.');

        return $member;
    }

    private function guarded(callable $action): JsonResponse
    {
        try {
            return response()->json($action());
        } catch (GameRuleException $exception) {
            return response()->json(['message' => $exception->getMessage(), 'reason' => $exception->reason], 422);
        }
    }
}
