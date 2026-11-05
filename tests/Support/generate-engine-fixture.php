<?php

// Regenerates tests/fixtures/engine-parity.json after an intentional rule change in app/Game.
// The JavaScript engine must then be updated until `npm run test:engine` passes again.
//
// Usage: php tests/Support/generate-engine-fixture.php

use Tests\Support\EngineParity;

require __DIR__.'/../../vendor/autoload.php';

if (! is_dir(dirname(EngineParity::FIXTURE))) {
    mkdir(dirname(EngineParity::FIXTURE), 0755, true);
}

file_put_contents(EngineParity::FIXTURE, json_encode(EngineParity::generate(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

echo 'Wrote '.round(filesize(EngineParity::FIXTURE) / 1024)." KB\n";
