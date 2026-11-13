<?php

namespace Tests\Unit;

use App\Services\UserAgentParser;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class UserAgentParserTest extends TestCase
{
    public static function agents(): array
    {
        return [
            'Chrome on Windows' => ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Chrome', 'Windows', 'desktop'],
            'Edge on Windows' => ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 'Edge', 'Windows', 'desktop'],
            'Safari on iPhone' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari', 'iOS', 'mobile'],
            'Chrome on iPhone' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1', 'Chrome', 'iOS', 'mobile'],
            'Chrome on an Android phone' => ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', 'Chrome', 'Android', 'mobile'],
            'Chrome on an Android tablet' => ['Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Chrome', 'Android', 'tablet'],
            'Samsung Internet' => ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36', 'Samsung Internet', 'Android', 'mobile'],
            'Safari on iPad' => ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari', 'iOS', 'tablet'],
            'Firefox on Linux' => ['Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0', 'Firefox', 'Linux', 'desktop'],
            'Safari on a Mac' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'Safari', 'macOS', 'desktop'],
            'Googlebot' => ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Other', 'Other', 'bot'],
            'curl' => ['curl/8.4.0', 'Other', 'Other', 'bot'],
            'Nothing sent' => [null, 'Other', 'Other', 'bot'],
        ];
    }

    #[DataProvider('agents')]
    public function test_it_recognises_common_browsers(?string $agent, string $browser, string $os, string $device): void
    {
        $this->assertSame(
            ['browser' => $browser, 'os' => $os, 'device' => $device],
            (new UserAgentParser())->parse($agent)
        );
    }
}
