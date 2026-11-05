<?php

namespace App\Services;

use App\Models\Visit;

/**
 * Good enough for a breakdown chart, not a device database. iPads that ask for desktop sites
 * report themselves as Macs, and browsers such as Brave deliberately look like Chrome.
 */
class UserAgentParser
{
    private const BOTS = '/bot\b|bot\/|crawl|spider|slurp|headless|facebookexternalhit|whatsapp|curl|wget|python-|httpclient|go-http|node-fetch|axios|lighthouse/i';

    // First match wins, so browsers that also claim to be Chrome or Safari come first.
    private const BROWSERS = [
        '/Edg(e|A|iOS)?\//' => 'Edge',
        '/OPR\/|Opera/' => 'Opera',
        '/SamsungBrowser/' => 'Samsung Internet',
        '/Firefox|FxiOS/' => 'Firefox',
        '/Chrome|CriOS/' => 'Chrome',
        '/Safari/' => 'Safari',
    ];

    // iOS comes before macOS because iPhones report "like Mac OS X", and Android before Linux.
    private const SYSTEMS = [
        '/Windows/' => 'Windows',
        '/iPhone|iPad|iPod/' => 'iOS',
        '/Android/' => 'Android',
        '/Mac OS X|Macintosh/' => 'macOS',
        '/CrOS/' => 'ChromeOS',
        '/Linux/' => 'Linux',
    ];

    /**
     * @return array{browser: string, os: string, device: string}
     */
    public function parse(?string $userAgent): array
    {
        $userAgent = (string) $userAgent;

        return [
            'browser' => $this->firstMatch(self::BROWSERS, $userAgent),
            'os' => $this->firstMatch(self::SYSTEMS, $userAgent),
            'device' => $this->device($userAgent),
        ];
    }

    private function device(string $userAgent): string
    {
        // Every real browser sends a user agent, so an empty one is a script.
        if ($userAgent === '' || preg_match(self::BOTS, $userAgent)) {
            return Visit::BOT;
        }

        if (preg_match('/iPad|Tablet|Android(?!.*Mobile)/', $userAgent)) {
            return 'tablet';
        }

        return preg_match('/Mobi|iPhone|iPod/', $userAgent) ? 'mobile' : 'desktop';
    }

    private function firstMatch(array $patterns, string $userAgent): string
    {
        foreach ($patterns as $pattern => $name) {
            if (preg_match($pattern, $userAgent)) {
                return $name;
            }
        }

        return 'Other';
    }
}
