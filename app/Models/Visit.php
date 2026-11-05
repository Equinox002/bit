<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Visit extends Model
{
    use MassPrunable;

    public const BOT = 'bot';

    public const UPDATED_AT = null;

    protected $guarded = [];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeHumans(Builder $query): Builder
    {
        return $query->where('device', '!=', self::BOT);
    }

    public function prunable(): Builder
    {
        return static::where('created_at', '<', now()->subDays(config('admin.visit_retention_days')));
    }

    public function toAdminArray(): array
    {
        return [
            'id' => $this->id,
            'ip' => $this->ip,
            'path' => $this->path,
            'referrer' => $this->referrer,
            'userAgent' => $this->user_agent,
            'browser' => $this->browser,
            'os' => $this->os,
            'device' => $this->device,
            'language' => $this->language,
            'status' => $this->status,
            'durationMs' => $this->duration_ms,
            'visitor' => $this->visitor_hash,
            'user' => $this->user === null ? null : [
                'id' => $this->user->id,
                'name' => $this->user->name,
                'isGuest' => (bool) $this->user->is_guest,
            ],
            'at' => $this->created_at->toIso8601String(),
        ];
    }
}
