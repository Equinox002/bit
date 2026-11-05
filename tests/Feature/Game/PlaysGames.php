<?php

namespace Tests\Feature\Game;

use App\Game\GameSettings;
use App\Models\GameRoom;
use App\Models\RoomMember;
use App\Models\User;
use App\Services\RoomService;
use Illuminate\Support\Str;

trait PlaysGames
{
    /**
     * @return array{0: GameRoom, 1: RoomMember}
     */
    protected function makeRoom(array $settings = [], bool $private = true): array
    {
        $name = $settings['name'] ?? 'Test table';
        unset($settings['name']);

        $room = app(RoomService::class)->create(
            $this->guest('Asha'),
            $name,
            'Asha',
            $private,
            'custom',
            GameSettings::fromArray($settings),
        );

        return [$room, $room->activeMembers()->first()];
    }

    /**
     * @return array{0: GameRoom, 1: RoomMember, 2: list<RoomMember>}
     */
    protected function makeRoomWithPlayers(int $count, array $settings = []): array
    {
        [$room, $host] = $this->makeRoom($settings);
        $members = [$host];

        for ($i = 2; $i <= $count; $i++) {
            $members[] = app(RoomService::class)->join($room, $this->guest("Player {$i}"), "Player {$i}");
        }

        return [$room, $host, $members];
    }

    /**
     * Started with hands that never trigger a narrow re-deal, so tests stay simple to reason about.
     *
     * @return array{0: GameRoom, 1: RoomMember, 2: list<RoomMember>}
     */
    protected function startedGame(int $count, array $settings = []): array
    {
        [$room, $host, $members] = $this->makeRoomWithPlayers($count, $settings);

        $this->asMember($host)->postJson("/rooms/{$room->code}/start")->assertOk();

        return [$room->fresh(), $host->fresh(), $members];
    }

    protected function asMember(RoomMember $member): static
    {
        return $this->actingAs($member->user);
    }

    /**
     * The real game state, as only the server may see it.
     */
    protected function state(GameRoom $room): array
    {
        return $room->sessions()->latest('id')->firstOrFail()->state;
    }

    protected function memberById(array $members, int $id): RoomMember
    {
        foreach ($members as $member) {
            if ($member->id === $id) {
                return $member;
            }
        }

        $this->fail("No member with id {$id}.");
    }

    protected function action(GameRoom $room, RoomMember $member, string $action, ?int $amount = null, ?string $key = null)
    {
        return $this->asMember($member)->postJson("/rooms/{$room->code}/actions", [
            'action' => $action,
            'amount' => $amount,
            'key' => $key ?? (string) Str::uuid(),
        ]);
    }

    /**
     * Have whoever the game is waiting for bet the minimum.
     */
    protected function actorBets(GameRoom $room, array $members)
    {
        $state = $this->state($room);
        $actor = $this->memberById($members, $this->currentActor($state));

        return [$actor, $this->action($room, $actor, 'bet', $this->minimumBet($room, $state))];
    }

    protected function currentActor(array $state): int
    {
        return $state['turn']['stage'] === 'own_bet' ? $state['turn']['activeId'] : $state['turn']['askedId'];
    }

    private function minimumBet(GameRoom $room, array $state): int
    {
        return min($room->rules()->minBet, $state['pot'] - array_sum(array_column($state['turn']['bets'], 'amount')));
    }

    private function guest(string $name): User
    {
        return User::forceCreate([
            'name' => $name,
            'email' => Str::uuid().'@guest.invalid',
            'password' => bcrypt('x'),
            'is_guest' => true,
        ]);
    }
}
