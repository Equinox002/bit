<?php

namespace Tests\Feature\Admin;

use App\Models\GameRoom;
use App\Models\User;
use App\Models\Visit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class AdminPanelTest extends TestCase
{
    use RefreshDatabase;

    private const PAGES = ['/admin', '/admin/visits', '/admin/users', '/admin/rooms'];

    private function admin(): User
    {
        return User::factory()->create()->forceFill(['is_admin' => true]);
    }

    private function visit(array $attributes = []): Visit
    {
        return Visit::create([
            'ip' => '192.168.1.10',
            'visitor_hash' => hash('sha256', $attributes['ip'] ?? '192.168.1.10'),
            'path' => '/',
            'route_name' => 'home',
            'browser' => 'Chrome',
            'os' => 'Windows',
            'device' => 'desktop',
            'status' => 200,
            'visited_on' => now(config('admin.timezone'))->toDateString(),
            ...$attributes,
        ]);
    }

    public function test_visitors_are_sent_to_login(): void
    {
        foreach (self::PAGES as $page) {
            $this->get($page)->assertRedirect('/login');
        }
    }

    public function test_players_and_guests_cannot_tell_the_panel_exists(): void
    {
        $player = User::factory()->create();
        $guest = User::factory()->create()->forceFill(['is_guest' => true]);
        // A guest row should never hold the flag, but if one did it still must not get in.
        $flaggedGuest = User::factory()->create()->forceFill(['is_guest' => true, 'is_admin' => true]);

        foreach ([$player, $guest, $flaggedGuest] as $user) {
            foreach (self::PAGES as $page) {
                $this->actingAs($user)->get($page)->assertNotFound();
            }
        }
    }

    public function test_registration_cannot_set_the_admin_flag(): void
    {
        $this->post('/register', [
            'name' => 'Sneaky',
            'email' => 'sneaky@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
            'is_admin' => true,
        ]);

        $this->assertFalse((bool) User::where('email', 'sneaky@example.com')->first()->is_admin);
    }

    public function test_profile_update_cannot_set_the_admin_flag(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->patch('/profile', ['name' => 'Sneaky', 'email' => $user->email, 'is_admin' => true]);

        $this->assertFalse((bool) $user->refresh()->is_admin);
    }

    public function test_admins_can_open_every_page(): void
    {
        $admin = $this->admin();

        foreach (self::PAGES as $page) {
            $this->actingAs($admin)->get($page)->assertOk();
        }
    }

    public function test_overview_counts_people_and_leaves_out_bots(): void
    {
        $this->visit(['ip' => '10.0.0.1']);
        $this->visit(['ip' => '10.0.0.1']);
        $this->visit(['ip' => '10.0.0.2']);
        $this->visit(['ip' => '10.0.0.3', 'device' => Visit::BOT]);

        $this->actingAs($this->admin())->get('/admin')->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Admin/Overview')
            ->where('stats.viewsToday', 3)
            ->where('stats.visitorsToday', 2)
            ->where('stats.activeNow', 2)
            ->has('visitsByDay', 30)
            ->where('visitsByDay.29.views', 3)
            ->where('visitsByDay.29.visitors', 2)
            ->where('visitsByDay.0.views', 0)
            ->where('addresses.0.ip', '10.0.0.1')
            ->where('addresses.0.total', 2)
        );
    }

    public function test_overview_range_can_only_be_a_listed_one(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->get('/admin?days=7')->assertInertia(fn (AssertableInertia $page) => $page->has('visitsByDay', 7));
        $this->actingAs($admin)->get('/admin?days=100000')->assertInertia(fn (AssertableInertia $page) => $page->has('visitsByDay', 30));
    }

    public function test_visits_can_be_filtered(): void
    {
        $admin = $this->admin();
        $player = User::factory()->create(['name' => 'Asha']);
        $this->visit(['ip' => '10.0.0.1', 'path' => '/how-to-play']);
        $this->visit(['ip' => '10.0.0.2', 'device' => 'mobile', 'user_id' => $player->id]);
        $this->visit(['ip' => '10.0.0.3', 'device' => Visit::BOT]);

        $count = fn (string $url, int $expected) => $this->actingAs($admin)->get($url)
            ->assertInertia(fn (AssertableInertia $page) => $page->where('visits.total', $expected));

        $count('/admin/visits', 2);
        $count('/admin/visits?device=bot', 1);
        $count('/admin/visits?device=mobile', 1);
        $count('/admin/visits?q=10.0.0.1', 1);
        $count('/admin/visits?q=how-to', 1);
        $count('/admin/visits?q=Asha', 1);
        $count("/admin/visits?user={$player->id}", 1);
        // A % is searched for literally, not treated as a wildcard.
        $count('/admin/visits?q=%25', 0);
    }

    public function test_players_page_hides_placeholder_emails_and_passwords(): void
    {
        $guest = User::factory()->create(['email' => 'guest-abc@guest.invalid'])->forceFill(['is_guest' => true]);
        $guest->save();
        $this->visit(['ip' => '10.0.0.9', 'user_id' => $guest->id]);

        $response = $this->actingAs($this->admin())->get('/admin/users?type=guest');

        $response->assertInertia(fn (AssertableInertia $page) => $page
            ->where('users.total', 1)
            ->where('users.data.0.email', null)
            ->where('users.data.0.lastIp', '10.0.0.9')
            ->where('users.data.0.visits', 1)
        );
        $this->assertStringNotContainsString($guest->password, $response->getContent());
    }

    public function test_rooms_can_be_filtered_by_status(): void
    {
        $owner = User::factory()->create();
        GameRoom::create(['code' => 'AAAAAA', 'name' => 'Open table', 'created_by' => $owner->id, 'status' => GameRoom::LOBBY]);
        GameRoom::create(['code' => 'BBBBBB', 'name' => 'Old table', 'created_by' => $owner->id, 'status' => GameRoom::FINISHED]);

        $this->actingAs($this->admin())->get('/admin/rooms?status=finished')->assertInertia(fn (AssertableInertia $page) => $page
            ->where('rooms.total', 1)
            ->where('rooms.data.0.code', 'BBBBBB')
        );
    }

    public function test_make_admin_command_grants_and_revokes_access(): void
    {
        $user = User::factory()->create(['email' => 'owner@example.com']);

        $this->artisan('admin:make', ['email' => 'owner@example.com'])->assertSuccessful();
        $this->assertTrue($user->refresh()->is_admin);

        $this->artisan('admin:make', ['email' => 'owner@example.com', '--revoke' => true])->assertSuccessful();
        $this->assertFalse($user->refresh()->is_admin);
    }

    public function test_make_admin_command_creates_a_missing_account(): void
    {
        $this->artisan('admin:make', ['email' => 'new@example.com'])
            ->expectsQuestion('Name', 'New Admin')
            ->expectsQuestion('Password (at least 8 characters)', 'long-enough-password')
            ->assertSuccessful();

        $this->assertTrue(User::where('email', 'new@example.com')->first()->is_admin);
    }

    public function test_make_admin_command_rejects_guests_and_short_passwords(): void
    {
        User::factory()->create(['email' => 'guest@guest.invalid'])->forceFill(['is_guest' => true])->save();

        $this->artisan('admin:make', ['email' => 'guest@guest.invalid'])->assertFailed();

        $this->artisan('admin:make', ['email' => 'short@example.com'])
            ->expectsQuestion('Name', 'Short')
            ->expectsQuestion('Password (at least 8 characters)', 'short')
            ->assertFailed();

        $this->assertDatabaseMissing('users', ['email' => 'short@example.com']);
    }
}
