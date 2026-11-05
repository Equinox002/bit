<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GameSession extends Model
{
    protected $guarded = [];

    /**
     * The state holds the undealt deck, so it is encrypted at rest.
     */
    protected $casts = [
        'state' => 'encrypted:array',
        'final' => 'array',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function rounds(): HasMany
    {
        return $this->hasMany(Round::class);
    }
}
