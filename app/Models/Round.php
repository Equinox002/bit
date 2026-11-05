<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Round extends Model
{
    protected $guarded = [];

    protected $casts = [
        'summary' => 'array',
        'ended_at' => 'datetime',
    ];
}
