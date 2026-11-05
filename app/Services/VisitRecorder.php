<?php

namespace App\Services;

use App\Models\Visit;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VisitRecorder
{
    // These URLs contain a secret, so only the route's pattern is stored.
    private const SECRET_ROUTES = ['password.reset', 'verification.verify'];

    public function __construct(private UserAgentParser $parser)
    {
    }

    public function record(Request $request, Response $response): void
    {
        $userAgent = $this->clean($request->userAgent(), 512);
        $ip = (string) $request->ip();

        Visit::create([
            'user_id' => $request->user()?->id,
            'ip' => $ip,
            'visitor_hash' => hash('sha256', $ip.'|'.$userAgent),
            'path' => $this->path($request),
            'route_name' => $this->clean($request->route()?->getName(), 64),
            'referrer' => $this->externalReferrer($request),
            'user_agent' => $userAgent,
            ...$this->parser->parse($userAgent),
            'language' => $this->clean($request->getLanguages()[0] ?? null, 16),
            'status' => $response->getStatusCode(),
            'duration_ms' => defined('LARAVEL_START') ? (int) ((microtime(true) - LARAVEL_START) * 1000) : null,
            'visited_on' => now(config('admin.timezone'))->toDateString(),
        ]);
    }

    private function path(Request $request): string
    {
        $route = $request->route();
        $path = $route?->named(...self::SECRET_ROUTES) ? $route->uri() : $request->path();

        return '/'.ltrim($this->clean($path, 254), '/');
    }

    /**
     * Only where people arrived from outside. A query string or an internal page's URL can hold
     * a secret, such as a password reset link, so neither is kept.
     */
    private function externalReferrer(Request $request): ?string
    {
        $referrer = (string) $request->headers->get('referer');
        $host = parse_url($referrer, PHP_URL_HOST);

        if (! is_string($host) || $host === $request->getHost()) {
            return null;
        }

        return $this->clean($host.parse_url($referrer, PHP_URL_PATH), 255);
    }

    /**
     * These values all come from the visitor, so they may be too long or not valid text.
     */
    private function clean(?string $value, int $length): ?string
    {
        return $value === null || $value === '' ? null : mb_substr(mb_scrub($value, 'UTF-8'), 0, $length);
    }
}
