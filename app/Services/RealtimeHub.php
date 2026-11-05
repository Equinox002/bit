<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Talks to the Socket.IO relay in realtime/. The relay only forwards "the room changed" pings, so
 * a relay outage slows updates down (clients fall back to polling) but never affects the game.
 */
class RealtimeHub
{
    private const RELAY_DOWN_KEY = 'realtime:relay-down';

    private const RELAY_RETRY_SECONDS = 10;

    /**
     * @param  list<string>  $events
     */
    public function publish(string $roomCode, int $version, array $events): void
    {
        $url = config('services.realtime.url');

        if (empty($url) || Cache::has(self::RELAY_DOWN_KEY)) {
            return;
        }

        try {
            Http::connectTimeout(1)
                ->timeout(1)
                ->withHeaders(['X-Realtime-Secret' => (string) config('services.realtime.secret')])
                ->post(rtrim($url, '/').'/publish', [
                    'room' => $roomCode,
                    'version' => $version,
                    'events' => array_values(array_unique($events)),
                ]);
        } catch (Throwable $exception) {
            // Waiting for a dead relay would add a second to every action for every player.
            Cache::put(self::RELAY_DOWN_KEY, true, self::RELAY_RETRY_SECONDS);
            Log::warning('Realtime publish failed: '.$exception->getMessage());
        }
    }

    /**
     * A short-lived credential that lets one member subscribe to one room's pings.
     */
    public function token(string $roomCode, int $memberId): string
    {
        $payload = rtrim(strtr(base64_encode(json_encode([
            'room' => $roomCode,
            'member' => $memberId,
            'exp' => now()->addHours(12)->timestamp,
        ])), '+/', '-_'), '=');

        return $payload.'.'.hash_hmac('sha256', $payload, (string) config('services.realtime.secret'));
    }

    public function verifySecret(?string $given): bool
    {
        $secret = (string) config('services.realtime.secret');

        return $secret !== '' && $given !== null && hash_equals($secret, $given);
    }
}
