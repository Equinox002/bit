<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Turn extends Model
{
    protected $guarded = [];

    protected $casts = [
        'won' => 'boolean',
    ];

    public function bets(): HasMany
    {
        return $this->hasMany(Bet::class);
    }
}
