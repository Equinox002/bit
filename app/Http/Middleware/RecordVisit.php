<?php

namespace App\Http\Middleware;

use App\Services\VisitRecorder;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class RecordVisit
{
    public function __construct(private VisitRecorder $recorder)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        return $next($request);
    }

    /**
     * Runs once the response is ready, and a failure here must never break the page itself.
     */
    public function terminate(Request $request, Response $response): void
    {
        if (! $this->isPageView($request, $response)) {
            return;
        }

        try {
            $this->recorder->record($request, $response);
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    private function isPageView(Request $request, Response $response): bool
    {
        if (! $request->isMethod('GET') || $request->routeIs('admin.*') || $request->hasHeader('X-Inertia-Partial-Data')) {
            return false;
        }

        // Redirects are followed by the real page, and 409 is Inertia asking for a full reload.
        if ($response->isRedirection() || $response->getStatusCode() === 409) {
            return false;
        }

        if ($request->hasHeader('X-Inertia')) {
            return true;
        }

        // The service worker fetches /pass-and-play in the background, and nobody is opening that page.
        $destination = $request->header('Sec-Fetch-Dest');

        if ($destination !== null && $destination !== 'document') {
            return false;
        }

        return str_contains((string) $response->headers->get('Content-Type'), 'text/html');
    }
}
