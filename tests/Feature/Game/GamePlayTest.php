<?php

namespace Tests\Feature\Game;

use App\Models\Bet;
use App\Models\GameEvent;
use App\Models\GameRoom;
use App\Models\PlayerCard;
use App\Models\PlayerStatistic;
use App\Models\Round;
use App\Models\Transaction;
use App\Models\Turn;
use App\Services\GameService;
use App\Services\RealtimeHub;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class GamePlayTest extends TestCase
{
    use RefreshDatabase;
    use PlaysGames;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_starting_deals_cards_and_builds_the_pot_from_contributions(): void
    {
        [$room] = $this->startedGame(3);
        $state = $this->state($room);

        $this->assertSame(GameRoom::PLAYING, $room->status);
        $this->assertSame(30, $state['pot']);
        $this->assertCount(46, $state['deck']);
        $this->assertSame(3, PlayerCard::count());
        $this->assertSame(1, Round::count());
    }

    public function test_a_turn_with_bets_settles_and_is_fully_recorded(): void
    {
        [$room, , $members] = $this->startedGame(3);

        $this->actorBets($room, $members)[1]->assertOk();

        while ($this->state($room)['turn']['stage'] !== 'reveal') {
            $state = $this->state($room);
            $this->action($room, $this->memberById($members, $this->currentActor($state)), 'pass')->assertOk();
        }

        $state = $this->state($room);
        $turn = Turn::firstOrFail();

        $this->assertSame($state['lastResult']['drawn'], $turn->drawn_card);
        $this->assertSame($state['lastResult']['won'], $turn->won);
        $this->assertSame(1, Bet::count());
        $this->assertSame(10, Bet::first()->amount);
        $this->assertSame(1, PlayerStatistic::where('bets_placed', 1)->count());
    }

    public function test_only_the_current_actor_can_act(): void
    {
        [$room, , $members] = $this->startedGame(3);
        $actorId = $this->currentActor($this->state($room));
        $other = collect($members)->first(fn ($m) => $m->id !== $actorId);

        $this->action($room, $other, 'bet', 10)->assertStatus(422)->assertJsonPath('reason', 'not_your_turn');
        $this->action($room, $other, 'pass')->assertStatus(422)->assertJsonPath('reason', 'not_your_turn');
    }

    public function test_non_members_are_refused_everywhere(): void
    {
        [$room] = $this->startedGame(2);
        [, $outsider] = $this->makeRoom();

        $this->asMember($outsider)->getJson("/rooms/{$room->code}/state")->assertForbidden();
        $this->action($room, $outsider, 'bet', 10)->assertForbidden();
        $this->asMember($outsider)->postJson("/rooms/{$room->code}/heartbeat")->assertForbidden();
        $this->asMember($outsider)->postJson("/rooms/{$room->code}/start")->assertForbidden();
    }

    public function test_unauthenticated_requests_are_refused(): void
    {
        [$room] = $this->startedGame(2);
        auth()->logout();

        $this->getJson("/rooms/{$room->code}/state")->assertUnauthorized();
        $this->postJson("/rooms/{$room->code}/actions", [])->assertUnauthorized();
    }

    public function test_invalid_payloads_are_rejected(): void
    {
        [$room, $host] = $this->startedGame(2);

        foreach ([
            ['action' => 'steal', 'key' => (string) Str::uuid()],
            ['action' => 'bet', 'key' => (string) Str::uuid()],
            ['action' => 'bet', 'amount' => -5, 'key' => (string) Str::uuid()],
            ['action' => 'bet', 'amount' => 'lots', 'key' => (string) Str::uuid()],
            ['action' => 'bet', 'amount' => 10.5, 'key' => (string) Str::uuid()],
            ['action' => 'pass'],
            ['action' => 'pass', 'key' => 'not-a-uuid'],
        ] as $payload) {
            $this->asMember($host)->postJson("/rooms/{$room->code}/actions", $payload)->assertStatus(422);
        }
    }

    public function test_host_only_actions_are_refused_for_other_players(): void
    {
        [$room, , $members] = $this->startedGame(2);

        foreach (['reset', 'end', 'continue'] as $action) {
            $this->action($room, $members[1], $action)->assertStatus(422)->assertJsonPath('reason', 'not_host');
        }
    }

    public function test_a_retried_bet_with_the_same_key_applies_once(): void
    {
        [$room, , $members] = $this->startedGame(3);
        $actor = $this->memberById($members, $this->currentActor($this->state($room)));
        $key = (string) Str::uuid();

        $this->action($room, $actor, 'bet', 10, $key)->assertOk()->assertJsonPath('duplicate', false);
        $version = $room->fresh()->version;
        $reserved = Transaction::where('type', 'bet_reserve')->count();

        $this->action($room, $actor, 'bet', 10, $key)->assertOk()->assertJsonPath('duplicate', true);

        $this->assertSame($version, $room->fresh()->version);
        $this->assertSame($reserved, Transaction::where('type', 'bet_reserve')->count());
        $this->assertSame(1, GameEvent::where('idempotency_key', $key)->count());
        $this->assertCount(1, $this->state($room)['turn']['bets']);
    }

    public function test_a_rejected_action_does_not_use_up_its_key(): void
    {
        [$room, , $members] = $this->startedGame(3);
        $actor = $this->memberById($members, $this->currentActor($this->state($room)));
        $key = (string) Str::uuid();

        $this->action($room, $actor, 'bet', 999999, $key)->assertStatus(422);
        $this->action($room, $actor, 'bet', 10, $key)->assertOk()->assertJsonPath('duplicate', false);
    }

    public function test_second_settlement_of_a_turn_is_blocked_by_the_database(): void
    {
        [$room, , $members] = $this->startedGame(2);
        $this->actorBets($room, $members)[1]->assertOk();
        $state = $this->state($room);

        while ($state['turn']['stage'] !== 'reveal') {
            $this->action($room, $this->memberById($members, $this->currentActor($state)), 'pass')->assertOk();
            $state = $this->state($room);
        }

        $turn = Turn::firstOrFail()->toArray();
        unset($turn['id']);

        $this->expectException(\Illuminate\Database\QueryException::class);
        Turn::create($turn);
    }

    public function test_ledger_rows_reconcile_with_the_game_state(): void
    {
        [$room, , $members] = $this->startedGame(3);

        // Play several turns so that settlement, contributions and pots all produce entries.
        for ($turn = 0; $turn < 6; $turn++) {
            $this->playOneTurnBettingMinimum($room, $members);
        }

        $this->assertLedgerReconciles($room);
    }

    public function test_every_transaction_records_the_required_audit_fields(): void
    {
        [$room, , $members] = $this->startedGame(2);
        $this->playOneTurnBettingMinimum($room, $members);

        $entry = Transaction::where('type', 'bet_reserve')->where('account', 'player')->firstOrFail();

        $this->assertTrue(Str::isUuid($entry->transaction_id));
        $this->assertSame($room->id, $entry->game_room_id);
        $this->assertNotNull($entry->round_id);
        $this->assertNotNull($entry->room_member_id);
        $this->assertSame(-10, $entry->amount);
        $this->assertSame($entry->previous_balance - 10, $entry->new_balance);
        $this->assertNotNull($entry->created_at);
    }

    public function test_host_ending_the_game_records_standings_and_statistics(): void
    {
        [$room, $host, $members] = $this->startedGame(3);
        $this->playOneTurnBettingMinimum($room, $members);

        $this->action($room, $host->fresh(), 'end')->assertOk()->assertJsonPath('status', 'finished');

        $room = $room->fresh();
        $session = $room->sessions()->first();
        $this->assertSame(GameRoom::FINISHED, $room->status);
        $this->assertCount(3, $session->final['standings']);
        $this->assertSame(3, PlayerStatistic::where('games_played', 1)->count());
        $this->assertGreaterThanOrEqual(1, PlayerStatistic::where('games_won', 1)->count());
        $this->assertLedgerReconciles($room);

        $this->actingAs($host->user)->get('/')->assertInertia(fn ($page) => $page->has('recentGames', 1));
    }

    public function test_deck_is_encrypted_at_rest_and_absent_from_every_client_response(): void
    {
        [$room, $host] = $this->startedGame(3);
        $state = $this->state($room);
        $nextCard = $state['deck'][0];
        $raw = \DB::table('game_sessions')->where('game_room_id', $room->id)->value('state');

        $this->assertStringNotContainsString('"deck"', $raw);

        $response = $this->asMember($host)->getJson("/rooms/{$room->code}/state")->assertOk();
        $this->assertArrayNotHasKey('deck', $response->json('game'));
        $this->assertSame(46, $response->json('game.deckCount'));

        foreach ($state['deck'] as $card) {
            $this->assertStringNotContainsString("\"{$card}\"", $response->getContent(), "Leaked undealt {$card}.");
        }

        $this->assertNotEmpty($nextCard);
    }

    public function test_hidden_rooms_keep_other_hands_off_the_wire(): void
    {
        [$room, , $members] = $this->startedGame(3, ['cardVisibility' => 'hidden']);
        $state = $this->state($room);
        $activeId = $state['turn']['activeId'];
        $viewer = collect($members)->first(fn ($m) => $m->id !== $activeId);
        $third = collect($members)->first(fn ($m) => $m->id !== $activeId && $m->id !== $viewer->id);

        $body = $this->asMember($viewer)->getJson("/rooms/{$room->code}/state")->assertOk()->getContent();

        foreach ($state['players'][$third->id]['hand'] as $card) {
            $this->assertStringNotContainsString("\"{$card}\"", $body);
        }
        $this->assertStringContainsString("\"{$state['players'][$viewer->id]['hand'][0]}\"", $body);
    }

    public function test_deadline_is_enforced_by_the_server_clock_not_the_caller(): void
    {
        [$room, $host] = $this->startedGame(3);
        $actor = $this->currentActor($this->state($room));

        $this->asMember($host)->postJson("/rooms/{$room->code}/heartbeat")->assertOk();
        $this->assertSame($actor, $this->currentActor($this->state($room)), 'Heartbeat before the deadline changes nothing.');

        Carbon::setTestNow(now()->addSeconds(31));
        $this->asMember($host)->postJson("/rooms/{$room->code}/heartbeat")->assertOk();

        $this->assertNotSame($actor, $this->currentActor($this->state($room)));
    }

    public function test_disconnected_player_is_passed_after_the_grace_period_and_can_reconnect(): void
    {
        [$room, , $members] = $this->startedGame(3);
        $actorId = $this->currentActor($this->state($room));
        $actor = $this->memberById($members, $actorId);
        $service = app(GameService::class);
        $observer = collect($members)->first(fn ($m) => $m->id !== $actorId);

        $service->setPresence($room, $actorId, false);
        $this->assertFalse($actor->fresh()->isConnected());

        $this->asMember($observer)->postJson("/rooms/{$room->code}/heartbeat")->assertOk();
        $this->assertSame($actorId, $this->currentActor($this->state($room)), 'Still inside the grace period.');

        Carbon::setTestNow(now()->addSeconds(GameService::OFFLINE_ACTOR_GRACE + 1));
        $observer->update(['last_seen_at' => now()]);
        $this->asMember($observer)->postJson("/rooms/{$room->code}/heartbeat")->assertOk();
        $this->assertNotSame($actorId, $this->currentActor($this->state($room)));

        // Their chips and hand are untouched, and the state comes straight back on reconnect.
        $this->asMember($actor)->postJson("/rooms/{$room->code}/heartbeat")->assertOk();
        $this->assertTrue($actor->fresh()->isConnected());

        $response = $this->asMember($actor)->getJson("/rooms/{$room->code}/state")->assertOk();
        $this->assertSame($actorId, $response->json('you'));
        $this->assertCount(2, collect($response->json('game.players'))->firstWhere('id', $actorId)['hand']);
    }

    public function test_host_disconnection_hands_over_after_the_grace_period(): void
    {
        [$room, $host, $members] = $this->startedGame(3);
        $service = app(GameService::class);

        $service->setPresence($room, $host->id, false);
        $service->enforce($room);
        $this->assertTrue($host->fresh()->is_host, 'Inside the grace period the host keeps the role.');

        Carbon::setTestNow(now()->addSeconds(GameService::HOST_GRACE + 1));
        foreach (array_slice($members, 1) as $member) {
            $member->update(['last_seen_at' => now()]);
        }
        $service->enforce($room);

        $this->assertFalse($host->fresh()->is_host);
        $this->assertTrue($members[1]->fresh()->is_host, 'next_seat policy picks the next seat.');
        $this->assertSame($members[1]->id, $this->state($room)['hostId']);
    }

    public function test_host_policy_can_keep_the_host_during_a_disconnect(): void
    {
        [$room, $host, $members] = $this->startedGame(2, ['hostPolicy' => 'none']);
        $service = app(GameService::class);

        $service->setPresence($room, $host->id, false);
        Carbon::setTestNow(now()->addSeconds(GameService::HOST_GRACE + 1));
        $members[1]->update(['last_seen_at' => now()]);
        $service->enforce($room);

        $this->assertTrue($host->fresh()->is_host);
    }

    public function test_silent_members_are_marked_disconnected_by_their_missing_heartbeat(): void
    {
        [$room, , $members] = $this->startedGame(2);

        Carbon::setTestNow(now()->addSeconds(GameService::STALE_AFTER + 1));
        $members[1]->update(['last_seen_at' => now()]);
        app(GameService::class)->enforce($room);

        $this->assertFalse($members[0]->fresh()->isConnected());
        $this->assertTrue($members[1]->fresh()->isConnected());
    }

    public function test_presence_endpoint_requires_the_relay_secret(): void
    {
        [$room, $host] = $this->makeRoom();
        $payload = ['room' => $room->code, 'member' => $host->id, 'connected' => false];

        $this->postJson('/api/internal/realtime/presence', $payload)->assertForbidden();
        $this->postJson('/api/internal/realtime/presence', $payload, ['X-Realtime-Secret' => 'wrong'])->assertForbidden();
        $this->assertTrue($host->fresh()->isConnected());

        $this->postJson('/api/internal/realtime/presence', $payload, ['X-Realtime-Secret' => 'test-secret'])->assertOk();
        $this->assertFalse($host->fresh()->isConnected());
    }

    public function test_leaving_mid_game_keeps_the_game_running_without_them(): void
    {
        [$room, , $members] = $this->startedGame(3);
        $state = $this->state($room);
        $leaver = $this->memberById($members, $this->currentActor($state));

        $this->asMember($leaver)->postJson("/rooms/{$room->code}/leave")->assertOk();

        $state = $this->state($room);
        $this->assertSame('left', $state['players'][$leaver->id]['status']);
        $this->assertNotSame($leaver->id, $this->currentActor($state));
        $this->assertSame(GameRoom::PLAYING, $room->fresh()->status);

        $this->asMember($leaver)->getJson("/rooms/{$room->code}/state")->assertForbidden();
    }

    public function test_game_finishes_when_too_few_players_remain(): void
    {
        [$room, , $members] = $this->startedGame(2);

        $this->asMember($members[1])->postJson("/rooms/{$room->code}/leave")->assertOk();

        $this->assertSame(GameRoom::FINISHED, $room->fresh()->status);
        $this->assertLedgerReconciles($room);
    }

    public function test_changes_publish_a_version_ping_with_no_game_data(): void
    {
        config(['services.realtime.url' => 'http://relay.test', 'services.realtime.secret' => 's3cret']);
        Http::fake(['relay.test/*' => Http::response(['ok' => true])]);

        [$room] = $this->startedGame(2);

        Http::assertSent(function ($request) use ($room) {
            return $request->url() === 'http://relay.test/publish'
                && $request->header('X-Realtime-Secret')[0] === 's3cret'
                && $request['room'] === $room->code
                && $request['version'] === $room->version
                && in_array('game:start', $request['events'], true)
                && ! str_contains($request->body(), 'deck')
                && ! str_contains($request->body(), 'hand');
        });
    }

    public function test_a_relay_outage_never_breaks_the_game(): void
    {
        config(['services.realtime.url' => 'http://relay.test']);
        Http::fake(fn () => throw new \Illuminate\Http\Client\ConnectionException('down'));

        [$room, $host] = $this->startedGame(2);

        $this->assertSame(GameRoom::PLAYING, $room->status);

        // After one failure it stops trying for a while, so later actions don't each wait on it.
        $this->action($room, $host, 'end')->assertOk();
        Http::assertSentCount(0);
    }

    public function test_realtime_token_is_signed_for_one_member_of_one_room(): void
    {
        $token = app(RealtimeHub::class)->token('ROOM01', 7);
        [$payload, $signature] = explode('.', $token);
        $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

        $this->assertSame('ROOM01', $claims['room']);
        $this->assertSame(7, $claims['member']);
        $this->assertSame(hash_hmac('sha256', $payload, 'test-secret'), $signature);
    }

    /**
     * Bets the minimum, then passes until the turn ends and the reveal pause is over.
     */
    private function playOneTurnBettingMinimum(GameRoom $room, array $members): void
    {
        $state = $this->state($room);

        if ($state['phase'] === 'round_summary') {
            $this->action($room, collect($members)->firstWhere('is_host', true), 'continue')->assertOk();
            $state = $this->state($room);
        }

        if ($state['phase'] !== 'playing') {
            return;
        }

        $this->actorBets($room, $members)[1]->assertOk();

        while (($state = $this->state($room))['phase'] === 'playing' && $state['turn']['stage'] !== 'reveal') {
            $this->action($room, $this->memberById($members, $this->currentActor($state)), 'pass')->assertOk();
        }

        Carbon::setTestNow(now()->addSeconds(6));
        foreach ($members as $member) {
            $member->update(['last_seen_at' => now()]);
        }
        app(GameService::class)->enforce($room);
    }

    private function assertLedgerReconciles(GameRoom $room): void
    {
        $session = $room->sessions()->latest('id')->firstOrFail();
        $state = $session->state;
        $entries = Transaction::where('game_session_id', $session->id)->orderBy('id')->get();
        $balances = [];

        foreach ($entries as $entry) {
            $key = $entry->account === 'player' ? "player{$entry->room_member_id}" : $entry->account;
            $this->assertSame($balances[$key] ?? 0, $entry->previous_balance, "Broken balance chain on {$key}.");
            $this->assertSame($entry->previous_balance + $entry->amount, $entry->new_balance);
            $balances[$key] = $entry->new_balance;
        }

        $this->assertSame($state['pot'], $balances['pot'] ?? 0);
        $this->assertSame($state['escrow'], $balances['escrow'] ?? 0);

        foreach ($state['players'] as $player) {
            $this->assertSame($player['chips'], $balances["player{$player['id']}"]);
        }
    }
}
