<?php

return [

    // Daily charts and "today" follow this timezone. The app itself stays on UTC.
    'timezone' => env('ADMIN_TIMEZONE', 'UTC'),

    // Visits hold IP addresses, so they are not kept forever. See App\Models\Visit::prunable().
    'visit_retention_days' => (int) env('VISIT_RETENTION_DAYS', 90),

];
