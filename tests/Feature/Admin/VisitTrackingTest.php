<?php

namespace Tests\Feature\Admin;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\User;
use App\Models\Visit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VisitTrackingTest extends TestCase
{
    use RefreshDatabase;

    private const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

    private function inertiaVersion(): string
    {
        return (string) app(HandleInertiaRequests::class)->version(request());
    }

    public function test_a_page_view_records_the_visitors_details(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '192.168.18.34'])
            ->withHeaders(['User-Agent' => self::PHONE, 'Accept-Language' => 'hi-IN,hi;q=0.9', 'Referer' => 'https://example.com/post?secret=1'])
            ->get('/how-to-play')
            ->assertOk();

        $visit = Visit::sole();

        $this->assertSame($user->id, $visit->user_id);
        $this->assertSame('192.168.18.34', $visit->ip);
        $this->assertSame('/how-to-play', $visit->path);
        $this->assertSame('how-to-play', $visit->route_name);
        $this->assertSame('mobile', $visit->device);
        $this->assertSame('Safari', $visit->browser);
        $this->assertSame('iOS', $visit->os);
        $this->assertSame('hi_IN', $visit->language);
        $this->assertSame(200, $visit->status);
        $this->assertSame(self::PHONE, $visit->user_agent);
        $this->assertSame('example.com/post', $visit->referrer, 'The query string must be dropped.');
    }

    public function test_navigating_inside_the_site_counts_as_a_page_view(): void
    {
        $this->withHeaders(['X-Inertia' => 'true', 'X-Inertia-Version' => $this->inertiaVersion(), 'Sec-Fetch-Dest' => 'empty'])
            ->get('/how-to-play')
            ->assertOk();

        $this->assertSame(1, Visit::count());
    }

    public function test_requests_that_are_not_page_views_are_left_out(): void
    {
        $admin = User::factory()->create()->forceFill(['is_admin' => true]);

        // The service worker's background copy of the offline page.
        $this->withHeaders(['Sec-Fetch-Dest' => 'empty'])->get('/pass-and-play');
        $this->flushHeaders();
        // A partial data reload.
        $this->withHeaders(['X-Inertia' => 'true', 'X-Inertia-Version' => $this->inertiaVersion(), 'X-Inertia-Partial-Data' => 'statistics'])
            ->get('/')
            ->assertOk();
        $this->flushHeaders();
        // A redirect, a form submission and the panel itself.
        $this->actingAs($admin)->get('/dashboard')->assertRedirect();
        $this->post('/logout');
        $this->actingAs($admin)->get('/admin')->assertOk();

        $this->assertSame(0, Visit::count());
    }

    public function test_secret_tokens_in_addresses_are_never_stored(): void
    {
        $this->withHeaders(['Referer' => 'http://localhost/reset-password/referrer-secret'])->get('/reset-password/secret-token?email=a@example.com')->assertOk();

        $visit = Visit::sole();

        $this->assertSame('/reset-password/{token}', $visit->path);
        $this->assertNull($visit->referrer);
    }

    public function test_bots_and_scripts_are_labelled(): void
    {
        $this->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'])->get('/');

        $this->assertSame(Visit::BOT, Visit::sole()->device);
    }

    public function test_a_forged_address_header_is_ignored_from_other_devices(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '192.168.18.34'])
            ->withHeaders(['X-Forwarded-For' => '8.8.8.8'])
            ->get('/');

        $this->assertSame('192.168.18.34', Visit::sole()->ip);
    }

    public function test_the_address_is_read_from_a_front_server_on_this_computer(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->withHeaders(['X-Forwarded-For' => '192.168.18.49'])
            ->get('/');

        $this->assertSame('192.168.18.49', Visit::sole()->ip);
    }

    public function test_oversized_or_invalid_values_do_not_lose_the_visit(): void
    {
        $this->withHeaders(['User-Agent' => str_repeat('a', 2000)."\xFF", 'Accept-Language' => str_repeat('b', 200)])
            ->get('/how-to-play')
            ->assertOk();

        $this->assertSame(512, strlen(Visit::sole()->user_agent));
    }

    public function test_a_recording_failure_does_not_break_the_page(): void
    {
        $this->withoutExceptionHandling();
        $this->app['db']->connection()->getSchemaBuilder()->drop('visits');

        $this->get('/how-to-play')->assertOk();
    }

    public function test_old_visits_are_pruned(): void
    {
        config(['admin.visit_retention_days' => 90]);
        $this->get('/how-to-play');
        $this->get('/how-to-play');
        Visit::query()->first()->forceFill(['created_at' => now()->subDays(91)])->save();

        $this->artisan('model:prune', ['--model' => [Visit::class]])->assertSuccessful();

        $this->assertSame(1, Visit::count());
    }
}
