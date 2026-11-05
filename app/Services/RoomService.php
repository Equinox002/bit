<?php

namespace App\Services;

use App\Game\GameRuleException;
use App\Game\GameSettings;
use App\Models\GameRoom;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class RoomService
{
    /** Letters and digits that are hard to confuse when read aloud or typed on a phone. */
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    private const CODE_LENGTH = 6;

    public function __construct(private readonly GameService $game)
    {
    }

    public function create(User $user, string $name, string $hostName, bool $isPrivate, string $preset, GameSettings $rules): GameRoom
    {
        return DB::transaction(function () use ($user, $name, $hostName, $isPrivate, $preset, $rules) {
            $room = GameRoom::create([
                'code' => $this->uniqueCode(),
                'name' => $name,
                'created_by' => $user->id,
                'is_private' => $isPrivate,
                'status' => GameRoom::LOBBY,
            ]);

            $room->settingsRecord()->create(['preset' => $preset, 'config' => $rules->toArray()]);
            $this->seat($room, $user, $hostName, 1, true);

            return $room;
        });
    }

    /**
     * Add a player, or return their existing seat if they are rejoining.
     */
    public function join(GameRoom $room, User $user, string $displayName): RoomMember
    {
        $member = null;

        $this->game->transact($room, null, null, 'room:player-joined', function (GameRoom $locked) use ($user, $displayName, &$member) {
            $existing = $locked->members()->where('user_id', $user->id)->first();

            if ($existing !== null && $existing->left_at === null) {
                $member = $existing;

                return null;
            }

            $this->assertCanJoin($locked, $displayName);

            // A player who left a game in progress forfeited their seat at that table.
            if ($existing !== null && $locked->status !== GameRoom::LOBBY) {
                throw new GameRuleException('left_game', 'You left this game, so you cannot rejoin it.');
            }

            $seat = (int) $locked->members()->max('seat') + 1;

            if ($existing !== null) {
                $existing->update(['left_at' => null, 'display_name' => $displayName, 'seat' => $seat, 'disconnected_at' => null, 'last_seen_at' => now()]);
                $member = $existing;
            } else {
                $member = $this->seat($locked, $user, $displayName, $seat, false);
            }

            return $locked->status === GameRoom::PLAYING
                ? ['room:player-joined', ...$this->game->addLatePlayer($locked, $member)]
                : ['room:player-joined'];
        });

        return $member;
    }

    public function leave(GameRoom $room, RoomMember $member): void
    {
        $this->game->transact($room, null, $member->id, 'room:player-left', function (GameRoom $locked) use ($member) {
            $member = $locked->members()->whereKey($member->id)->whereNull('left_at')->first();

            if ($member === null) {
                return null;
            }

            $events = $locked->status === GameRoom::PLAYING
                ? $this->game->removePlayer($locked, $member)
                : [];

            $wasHost = $member->is_host;
            $member->update(['left_at' => now(), 'is_host' => false]);

            if ($locked->activeMembers()->count() === 0) {
                if ($locked->status === GameRoom::LOBBY) {
                    $locked->status = GameRoom::CLOSED;
                }
            } elseif ($wasHost) {
                array_push($events, ...$this->game->reassignHostIfNeeded($locked));
            }

            return ['room:player-left', ...$events];
        });
    }

    public function updateSettings(GameRoom $room, RoomMember $member, string $preset, GameSettings $rules): void
    {
        $this->game->transact($room, null, $member->id, 'room:settings-updated', function (GameRoom $locked) use ($member, $preset, $rules) {
            if (! $locked->members()->whereKey($member->id)->where('is_host', true)->whereNull('left_at')->exists()) {
                throw new GameRuleException('not_host', 'Only the host can change the settings.');
            }

            if ($locked->status !== GameRoom::LOBBY) {
                throw new GameRuleException('wrong_phase', 'Settings cannot change after the game starts.');
            }

            if ($locked->activeMembers()->count() > $rules->maxPlayers) {
                throw new GameRuleException('too_many_players', 'More players have already joined than this limit allows.');
            }

            $locked->settingsRecord()->update(['preset' => $preset, 'config' => json_encode($rules->toArray())]);

            return ['room:settings-updated'];
        });
    }

    public function assertCanJoin(GameRoom $locked, string $displayName): void
    {
        $rules = $locked->rules();

        if (in_array($locked->status, [GameRoom::FINISHED, GameRoom::CLOSED], true)) {
            throw new GameRuleException('room_closed', 'This game has ended.');
        }

        if ($locked->status === GameRoom::PLAYING && ! $rules->allowLateJoin) {
            throw new GameRuleException('late_join_disabled', 'This game has already started.');
        }

        if ($locked->activeMembers()->count() >= $rules->maxPlayers) {
            throw new GameRuleException('room_full', 'This room is full.');
        }

        $taken = $locked->activeMembers()->get()->contains(
            fn (RoomMember $m) => mb_strtolower($m->display_name) === mb_strtolower($displayName),
        );

        if ($taken) {
            throw new GameRuleException('name_taken', 'Someone in this room already uses that name.');
        }
    }

    private function seat(GameRoom $room, User $user, string $displayName, int $seat, bool $isHost): RoomMember
    {
        return $room->members()->create([
            'user_id' => $user->id,
            'display_name' => $displayName,
            'seat' => $seat,
            'avatar_hue' => random_int(0, 359),
            'is_host' => $isHost,
            'last_seen_at' => now(),
        ]);
    }

    private function uniqueCode(): string
    {
        do {
            $code = '';

            for ($i = 0; $i < self::CODE_LENGTH; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }
        } while (GameRoom::where('code', $code)->exists());

        return $code;
    }
}
