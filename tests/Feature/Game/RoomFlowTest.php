<?php

namespace Tests\Feature\Game;

use App\Models\GameRoom;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoomFlowTest extends TestCase
{
    use RefreshDatabase;
    use PlaysGames;

    public function test_a_visitor_creates_a_room_with_just_a_name_and_becomes_host(): void
    {
        $response = $this->post('/rooms', [
            'name' => 'Friday Night',
            'hostName' => 'Asha',
            'isPrivate' => true,
            'preset' => 'classic',
            'settings' => ['startingChips' => 2000],
        ]);

        $room = GameRoom::firstOrFail();

        $response->assertRedirect("/rooms/{$room->code}");
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Z2-9]{6}$/', $room->code);
        $this->assertAuthenticated();
        $this->assertTrue(User::first()->is_guest);
        $this->assertSame(2000, $room->rules()->startingChips);

        $member = $room->activeMembers()->first();
        $this->assertTrue($member->is_host);
        $this->assertSame('Asha', $member->display_name);
    }

    public function test_presets_apply_and_invalid_settings_are_rejected(): void
    {
        $this->post('/rooms', [
            'name' => 'Quick', 'hostName' => 'Asha', 'isPrivate' => true, 'preset' => 'quick',
        ])->assertRedirect();
        $this->assertSame(20, GameRoom::firstOrFail()->rules()->turnTimeout);

        $this->post('/rooms', [
            'name' => 'Bad', 'hostName' => 'Asha', 'isPrivate' => true, 'preset' => 'custom',
            'settings' => ['minBet' => 500, 'maxBet' => 100],
        ])->assertSessionHasErrors('settings.minBet');

        $this->assertSame(1, GameRoom::count());
    }

    public function test_joining_by_code_and_link_shows_details_and_adds_the_player(): void
    {
        [$room] = $this->makeRoom();

        $this->flushSession();
        auth()->logout();

        $this->post('/join', ['code' => strtolower($room->code)])->assertRedirect("/join/{$room->code}");
        $this->post('/join', ['code' => 'NOPE99'])->assertSessionHasErrors('code');

        $this->get("/join/{$room->code}")->assertOk()->assertInertia(fn ($page) => $page
            ->component('Rooms/Join')
            ->where('room.name', $room->name)
            ->where('room.playerCount', 1)
            ->where('room.joinable', true));

        $this->post("/join/{$room->code}", ['name' => 'Ben'])->assertRedirect("/rooms/{$room->code}");
        $this->assertSame(2, $room->activeMembers()->count());
    }

    public function test_visiting_a_room_without_joining_redirects_to_the_join_page(): void
    {
        [$room] = $this->makeRoom();
        auth()->logout();

        $this->get("/rooms/{$room->code}")->assertRedirect("/join/{$room->code}");
    }

    public function test_duplicate_names_and_full_rooms_are_rejected_without_creating_guests(): void
    {
        [$room] = $this->makeRoom(['maxPlayers' => 2]);
        auth()->logout();
        $guests = User::count();

        $this->post("/join/{$room->code}", ['name' => 'asha'])->assertSessionHasErrors('name');
        $this->assertSame($guests, User::count());
        $this->assertGuest();

        $this->post("/join/{$room->code}", ['name' => 'Ben'])->assertRedirect();
        auth()->logout();

        $this->post("/join/{$room->code}", ['name' => 'Cal'])->assertSessionHasErrors('name');
        $this->assertSame(2, $room->activeMembers()->count());
    }

    public function test_control_characters_in_names_are_rejected(): void
    {
        [$room] = $this->makeRoom();
        auth()->logout();

        $this->post("/join/{$room->code}", ['name' => "Ben\r\nX"])->assertSessionHasErrors('name');
    }

    public function test_only_the_host_can_change_settings_or_start(): void
    {
        [$room, $host, $members] = $this->makeRoomWithPlayers(3);
        $guest = $members[1];

        $this->asMember($guest)->postJson("/rooms/{$room->code}/start")->assertStatus(422)->assertJsonPath('reason', 'not_host');
        $this->asMember($guest)->postJson("/rooms/{$room->code}/settings", ['preset' => 'classic'])
            ->assertStatus(422)->assertJsonPath('reason', 'not_host');

        $this->asMember($host)->postJson("/rooms/{$room->code}/settings", [
            'preset' => 'custom',
            'settings' => ['startingChips' => 500],
        ])->assertOk()->assertJsonPath('settings.startingChips', 500);

        $this->asMember($host)->postJson("/rooms/{$room->code}/start")->assertOk()->assertJsonPath('status', 'playing');
    }

    public function test_starting_requires_the_minimum_players(): void
    {
        [$room, $host] = $this->makeRoom();

        $this->asMember($host)->postJson("/rooms/{$room->code}/start")
            ->assertStatus(422)->assertJsonPath('reason', 'not_enough_players');
    }

    public function test_settings_cannot_change_after_the_game_starts(): void
    {
        [$room, $host] = $this->startedGame(3);

        $this->asMember($host)->postJson("/rooms/{$room->code}/settings", ['preset' => 'classic'])
            ->assertStatus(422)->assertJsonPath('reason', 'wrong_phase');
    }

    public function test_nobody_can_join_after_the_start_unless_late_joining_is_enabled(): void
    {
        [$room] = $this->startedGame(2);
        auth()->logout();

        $this->post("/join/{$room->code}", ['name' => 'Late'])->assertSessionHasErrors('name');
    }

    public function test_a_late_player_joins_when_enabled_and_pays_in(): void
    {
        [$room] = $this->startedGame(2, ['allowLateJoin' => true]);
        $potBefore = $this->state($room)['pot'];
        auth()->logout();

        $this->post("/join/{$room->code}", ['name' => 'Late'])->assertRedirect("/rooms/{$room->code}");

        $state = $this->state($room);
        $this->assertSame($potBefore + 10, $state['pot']);
        $this->assertSame('waiting', collect($state['players'])->firstWhere('name', 'Late')['status']);
    }

    public function test_leaving_the_lobby_hands_the_host_role_on(): void
    {
        [$room, $host, $members] = $this->makeRoomWithPlayers(2);

        $this->asMember($host)->postJson("/rooms/{$room->code}/leave")->assertOk();

        $this->assertTrue($members[1]->fresh()->is_host);
        $this->assertNotNull($host->fresh()->left_at);
    }

    public function test_room_closes_when_everyone_leaves_the_lobby(): void
    {
        [$room, $host] = $this->makeRoom();

        $this->asMember($host)->postJson("/rooms/{$room->code}/leave")->assertOk();

        $this->assertSame(GameRoom::CLOSED, $room->fresh()->status);
    }

    public function test_play_now_finds_an_open_public_table_or_offers_to_create_one(): void
    {
        $this->get('/play')->assertRedirect('/rooms/create');

        [$private] = $this->makeRoom();
        $this->get('/play')->assertRedirect('/rooms/create');

        $public = $this->makeRoom(['name' => 'Open table'], false)[0];
        $this->get('/play')->assertRedirect("/join/{$public->code}");
        $this->assertNotSame($private->code, $public->code);
    }

    public function test_guest_who_registers_keeps_their_seat(): void
    {
        [$room, $host] = $this->makeRoom();
        $this->actingAs($host->user);

        $this->post('/register', [
            'name' => 'Asha',
            'email' => 'asha@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertRedirect('/');

        $user = $host->user->fresh();
        $this->assertFalse($user->is_guest);
        $this->assertSame('asha@example.com', $user->email);
        $this->assertSame(1, User::where('email', 'asha@example.com')->count());
        $this->assertSame($user->id, $room->memberFor($user)->user_id);
    }

    public function test_guests_are_sent_to_registration_instead_of_the_profile_page(): void
    {
        [, $host] = $this->makeRoom();

        $this->actingAs($host->user)->get('/profile')->assertRedirect('/register');
    }

    public function test_email_with_a_line_break_is_rejected_at_registration(): void
    {
        $this->post('/register', [
            'name' => 'X',
            'email' => "x@example.com\r\nBcc: y@example.com",
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertSessionHasErrors('email');
    }

    public function test_home_and_how_to_play_render(): void
    {
        $this->get('/')->assertOk()->assertInertia(fn ($page) => $page->component('Home'));
        $this->get('/how-to-play')->assertOk()->assertInertia(fn ($page) => $page->component('HowToPlay'));
        $this->get('/rooms/create')->assertOk()->assertInertia(fn ($page) => $page->component('Rooms/Create')->has('presets.quick'));
    }

    public function test_pass_and_play_page_never_carries_the_account_because_it_is_cached(): void
    {
        $user = User::factory()->create();

        $this->get('/pass-and-play')->assertOk()->assertInertia(fn ($page) => $page->component('PassAndPlay'));

        $response = $this->actingAs($user)->get('/pass-and-play')->assertOk();
        $response->assertInertia(fn ($page) => $page->component('PassAndPlay')->where('auth.user', null));
        $this->assertStringNotContainsString($user->email, $response->getContent());
    }

    public function test_room_page_gives_members_their_state(): void
    {
        [$room, $host] = $this->startedGame(2);

        $this->actingAs($host->user)->get("/rooms/{$room->code}")->assertOk()->assertInertia(fn ($page) => $page
            ->component('Rooms/Room')
            ->where('initial.code', $room->code)
            ->where('initial.status', 'playing')
            ->has('initial.game.players', 2));
    }
}
