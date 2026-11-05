<?php

namespace App\Models;

use App\Game\GameSettings;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class GameRoom extends Model
{
    public const LOBBY = 'lobby';

    public const PLAYING = 'playing';

    public const FINISHED = 'finished';

    public const CLOSED = 'closed';

    protected $guarded = [];

    protected $casts = [
        'is_private' => 'boolean',
    ];

    public function settingsRecord(): HasOne
    {
        return $this->hasOne(GameSetting::class);
    }

    public function members(): HasMany
    {
        return $this->hasMany(RoomMember::class);
    }

    public function activeMembers(): HasMany
    {
        return $this->members()->whereNull('left_at')->orderBy('seat');
    }

    public function host(): HasOne
    {
        return $this->hasOne(RoomMember::class)->where('is_host', true);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(GameSession::class);
    }

    public function latestSession(): HasOne
    {
        return $this->hasOne(GameSession::class)->latestOfMany();
    }

    public function rules(): GameSettings
    {
        return GameSettings::fromArray($this->settingsRecord->config);
    }

    public function memberFor(?User $user): ?RoomMember
    {
        return $user === null
            ? null
            : $this->members()->where('user_id', $user->id)->whereNull('left_at')->first();
    }
}
