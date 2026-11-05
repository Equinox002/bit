<?php

namespace App\Services;

use App\Game\GameEngine;
use App\Game\GameRuleException;
use App\Game\SecureRandomizer;
use App\Game\StateValidator;
use App\Models\GameEvent;
use App\Models\GameRoom;
use App\Models\GameSession;
use App\Models\RoomMember;
use Illuminate\Support\Facades\DB;

/**
 * Runs engine actions safely. Every change happens in one database transaction holding a row lock
 * on the room, so actions in a room apply one at a time, and a failed check rolls everything back.
 */
class GameService
{
    /** How long a disconnected player may hold up betting before being passed automatically. */
    public const OFFLINE_ACTOR_GRACE = 10;

    /** How long a disconnected host keeps the role before it moves on. */
    public const HOST_GRACE = 30;

    /** A member with no heartbeat for this long is treated as disconnected. */
    public const STALE_AFTER = 45;

    public function __construct(
        private readonly GameRecorder $recorder,
        private readonly RealtimeHub $hub,
    ) {
    }

    public function start(GameRoom $room, RoomMember $member): void
    {
        $this->transact($room, null, $member->id, 'game:start', function (GameRoom $locked) use ($member) {
            $this->requireHost($locked, $member);

            if ($locked->status !== GameRoom::LOBBY) {
                throw new GameRuleException('wrong_phase', 'This game has already started.');
            }

            $rules = $locked->rules();
            $members = $locked->activeMembers()->get();

            if ($members->count() < $rules->minPlayers) {
                throw new GameRuleException('not_enough_players', "At least {$rules->minPlayers} players are needed to start.");
            }

            $players = $members->map(fn (RoomMember $m) => ['id' => $m->id, 'name' => $m->display_name])->all();
            $engine = GameEngine::begin($players, $rules, new SecureRandomizer(), now()->timestamp, $member->id);
            StateValidator::assertValid($engine->state());

            $session = GameSession::create([
                'game_room_id' => $locked->id,
                'status' => GameRoom::PLAYING,
                'state' => $engine->state(),
                'started_at' => now(),
            ]);

            $locked->status = GameRoom::PLAYING;
            $this->saveProgress($locked, $session, $engine);

            return array_column($engine->events(), 'type');
        });
    }

    /**
     * @return bool False when this idempotency key was already processed, so nothing was applied.
     */
    public function act(GameRoom $room, RoomMember $member, string $action, ?int $amount, string $key): bool
    {
        return $this->transact($room, $key, $member->id, "action:{$action}", function (GameRoom $locked) use ($member, $action, $amount) {
            $current = $locked->members()->whereKey($member->id)->whereNull('left_at')->first();

            if ($current === null) {
                throw new GameRuleException('not_a_member', 'You are no longer in this room.');
            }

            return $this->runEngine($locked, function (GameEngine $engine) use ($locked, $current, $action, $amount) {
                match ($action) {
                    'bet' => $engine->placeBet($current->id, $amount ?? 0),
                    'pass' => $engine->pass($current->id),
                    'reset' => $this->hostOnly($locked, $current, fn () => $engine->requestReset()),
                    'continue' => $this->hostOnly($locked, $current, fn () => $engine->continueToNextRound()),
                    'end' => $this->hostOnly($locked, $current, fn () => $engine->endGame()),
                };

                return true;
            });
        });
    }

    /**
     * Enforce deadlines, disconnections and host handover. Any client may trigger this, because
     * it only ever does what the server's own clock and records say is due.
     */
    public function enforce(GameRoom $room): bool
    {
        if (! $this->somethingIsDue($room)) {
            return false;
        }

        return $this->transact($room, null, null, 'game:enforce', function (GameRoom $locked) {
            $events = $this->expireStaleMembers($locked);
            array_push($events, ...$this->reassignHostIfNeeded($locked));

            if ($locked->status === GameRoom::PLAYING) {
                $engineEvents = $this->runEngine($locked, function (GameEngine $engine) use ($locked) {
                    $actor = $engine->currentActor();

                    if ($actor !== null && $this->offlineLongEnough($locked, $actor)) {
                        return $engine->passOffline($actor);
                    }

                    return $engine->tick();
                });

                array_push($events, ...($engineEvents ?? []));
            }

            return $events === [] ? null : $events;
        });
    }

    public function heartbeat(GameRoom $room, RoomMember $member): void
    {
        $member->update(['last_seen_at' => now()]);

        if (! $member->isConnected()) {
            $this->setPresence($room, $member->id, true);
        }

        $this->enforce($room);
    }

    public function setPresence(GameRoom $room, int $memberId, bool $connected): void
    {
        $this->transact($room, null, $memberId, 'presence', function (GameRoom $locked) use ($memberId, $connected) {
            $member = $locked->members()->whereKey($memberId)->whereNull('left_at')->first();

            if ($member === null || $member->isConnected() === $connected) {
                return null;
            }

            $member->update([
                'disconnected_at' => $connected ? null : now(),
                'last_seen_at' => now(),
            ]);

            return [$connected ? 'player:reconnected' : 'player:disconnected'];
        });
    }

    /**
     * Join a game already in progress, when the room allows it.
     */
    public function addLatePlayer(GameRoom $locked, RoomMember $member): array
    {
        return $this->runEngine($locked, function (GameEngine $engine) use ($member) {
            $engine->addLatePlayer($member->id, $member->display_name);

            return true;
        }) ?? [];
    }

    public function removePlayer(GameRoom $locked, RoomMember $member): array
    {
        return $this->runEngine($locked, function (GameEngine $engine) use ($member) {
            $engine->removePlayer($member->id);

            return true;
        }) ?? [];
    }

    /**
     * Run a change under the room lock. The callback returns the event types it produced, or null
     * when nothing changed. Connected clients are told only after the transaction has committed.
     *
     * @return bool False when nothing was applied.
     */
    public function transact(GameRoom $room, ?string $key, ?int $memberId, string $type, callable $change): bool
    {
        $published = DB::transaction(function () use ($room, $key, $memberId, $type, $change) {
            /** @var GameRoom $locked */
            $locked = GameRoom::whereKey($room->id)->lockForUpdate()->firstOrFail();

            if ($key !== null && GameEvent::where('game_room_id', $locked->id)->where('idempotency_key', $key)->exists()) {
                return null;
            }

            $events = $change($locked);

            if ($events === null) {
                return null;
            }

            $locked->version++;
            $locked->save();

            GameEvent::create([
                'game_room_id' => $locked->id,
                'version' => $locked->version,
                'type' => $type,
                'room_member_id' => $memberId,
                'payload' => ['events' => $events],
                'idempotency_key' => $key,
            ]);

            return ['version' => $locked->version, 'events' => $events, 'code' => $locked->code];
        }, 3);

        if ($published === null) {
            return false;
        }

        $this->hub->publish($published['code'], $published['version'], $published['events']);

        return true;
    }

    /**
     * @return list<string>|null The engine events, or null when the action changed nothing.
     */
    private function runEngine(GameRoom $locked, callable $action): ?array
    {
        $session = $locked->sessions()->latest('id')->first();

        if ($session === null || $locked->status !== GameRoom::PLAYING) {
            throw new GameRuleException('wrong_phase', 'No game is in progress.');
        }

        $engine = new GameEngine($session->state, $locked->rules(), new SecureRandomizer(), now()->timestamp);

        if (! $action($engine)) {
            return null;
        }

        $this->saveProgress($locked, $session, $engine);

        return array_column($engine->events(), 'type');
    }

    private function saveProgress(GameRoom $locked, GameSession $session, GameEngine $engine): void
    {
        $state = $engine->state();
        StateValidator::assertValid($state);

        $session->state = $state;
        $session->save();
        $this->recorder->record($locked, $session, $engine);

        $locked->next_deadline_at = $state['deadline'];
        $locked->actor_member_id = $engine->currentActor();
    }

    private function hostOnly(GameRoom $locked, RoomMember $member, callable $action): void
    {
        $this->requireHost($locked, $member);
        $action();
    }

    private function requireHost(GameRoom $locked, RoomMember $member): void
    {
        if (! $locked->members()->whereKey($member->id)->where('is_host', true)->whereNull('left_at')->exists()) {
            throw new GameRuleException('not_host', 'Only the host can do that.');
        }
    }

    private function somethingIsDue(GameRoom $room): bool
    {
        $room = $room->fresh();

        if ($room === null || in_array($room->status, [GameRoom::FINISHED, GameRoom::CLOSED], true)) {
            return false;
        }

        if ($room->next_deadline_at !== null && $room->next_deadline_at <= now()->timestamp) {
            return true;
        }

        foreach ($room->activeMembers()->get() as $member) {
            if ($member->isConnected() && $member->last_seen_at?->lt(now()->subSeconds(self::STALE_AFTER))) {
                return true;
            }

            if (! $member->isConnected()) {
                $handoverDue = $member->is_host && $member->disconnected_at->lte(now()->subSeconds(self::HOST_GRACE));
                $actorDue = $member->id === (int) $room->actor_member_id
                    && $member->disconnected_at->lte(now()->subSeconds(self::OFFLINE_ACTOR_GRACE));

                if ($handoverDue || $actorDue) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @return list<string>
     */
    private function expireStaleMembers(GameRoom $locked): array
    {
        $events = [];

        foreach ($locked->activeMembers()->get() as $member) {
            if ($member->isConnected() && $member->last_seen_at?->lt(now()->subSeconds(self::STALE_AFTER))) {
                $member->update(['disconnected_at' => $member->last_seen_at]);
                $events[] = 'player:disconnected';
            }
        }

        return $events;
    }

    /**
     * @return list<string>
     */
    public function reassignHostIfNeeded(GameRoom $locked): array
    {
        $policy = $locked->rules()->hostPolicy;
        $members = $locked->activeMembers()->get();
        $host = $members->firstWhere('is_host', true);

        if ($host !== null && ($policy === 'none'
            || $host->isConnected()
            || $host->disconnected_at->gt(now()->subSeconds(self::HOST_GRACE)))) {
            return [];
        }

        $online = $members->filter(fn (RoomMember $m) => $m->isConnected());

        if ($online->isEmpty()) {
            return [];
        }

        $successor = $policy === 'longest_member'
            ? $online->sortBy('created_at')->first()
            : ($online->first(fn (RoomMember $m) => $m->seat > ($host->seat ?? 0)) ?? $online->first());

        $host?->update(['is_host' => false]);
        $successor->update(['is_host' => true]);

        if ($locked->status === GameRoom::PLAYING) {
            $this->runEngine($locked, function (GameEngine $engine) use ($successor) {
                $engine->setHost($successor->id);

                return true;
            });
        }

        return ['room:host-changed'];
    }

    private function offlineLongEnough(GameRoom $locked, int $memberId): bool
    {
        $member = $locked->members()->whereKey($memberId)->first();

        return $member !== null
            && ! $member->isConnected()
            && $member->disconnected_at->lte(now()->subSeconds(self::OFFLINE_ACTOR_GRACE));
    }
}
