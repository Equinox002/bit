<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('game_rooms', function (Blueprint $table) {
            $table->id();
            $table->string('code', 8)->unique();
            $table->string('name', 60);
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_private')->default(true);
            $table->string('status', 16)->default('lobby')->index();
            $table->unsignedBigInteger('version')->default(0);
            $table->unsignedBigInteger('next_deadline_at')->nullable();
            $table->unsignedBigInteger('actor_member_id')->nullable();
            $table->timestamps();
        });

        Schema::create('game_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_room_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('preset', 16)->default('classic');
            $table->json('config');
            $table->timestamps();
        });

        Schema::create('room_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_room_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('display_name', 24);
            $table->unsignedSmallInteger('seat');
            $table->unsignedSmallInteger('avatar_hue')->default(0);
            $table->boolean('is_host')->default(false);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('disconnected_at')->nullable();
            $table->timestamp('left_at')->nullable();
            $table->timestamps();
            $table->unique(['game_room_id', 'user_id']);
        });

        Schema::create('game_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_room_id')->constrained()->cascadeOnDelete();
            $table->string('status', 16)->default('playing');
            $table->longText('state');
            $table->string('end_reason', 32)->nullable();
            $table->json('final')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
        });

        Schema::create('rounds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_session_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('number');
            $table->unsignedBigInteger('starting_member_id')->nullable();
            $table->unsignedBigInteger('dealer_member_id')->nullable();
            $table->unsignedBigInteger('starting_pot')->default(0);
            $table->unsignedBigInteger('ending_pot')->nullable();
            $table->unsignedBigInteger('winning_bets')->default(0);
            $table->unsignedBigInteger('losing_bets')->default(0);
            $table->unsignedInteger('cards_drawn')->default(0);
            $table->unsignedInteger('redeals')->default(0);
            $table->string('reset_reason', 32)->nullable();
            $table->json('summary')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
            $table->unique(['game_session_id', 'number']);
        });

        Schema::create('player_cards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('round_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_member_id')->constrained()->cascadeOnDelete();
            $table->string('card_1', 3);
            $table->string('card_2', 3);
            $table->timestamps();
            $table->unique(['round_id', 'room_member_id']);
        });

        Schema::create('betting_cycles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('round_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('number');
            $table->timestamps();
            $table->unique(['round_id', 'number']);
        });

        Schema::create('turns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('round_id')->constrained()->cascadeOnDelete();
            $table->foreignId('betting_cycle_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('number');
            $table->foreignId('active_member_id')->constrained('room_members')->cascadeOnDelete();
            $table->string('card_1', 3);
            $table->string('card_2', 3);
            $table->string('range_label', 8);
            $table->string('drawn_card', 3);
            $table->boolean('won');
            $table->unsignedBigInteger('pot_before');
            $table->unsignedBigInteger('pot_after');
            $table->timestamps();
            // A second settlement of the same turn fails here even if the rules were ever bypassed.
            $table->unique(['game_session_id', 'number']);
        });

        Schema::create('bets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('turn_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_member_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('amount');
            $table->unsignedBigInteger('profit');
            $table->unsignedBigInteger('payout');
            $table->boolean('won');
            $table->timestamps();
            $table->unique(['turn_id', 'room_member_id']);
        });

        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->uuid('transaction_id')->unique();
            $table->foreignId('game_room_id')->constrained()->cascadeOnDelete();
            $table->foreignId('game_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('round_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('turn_number')->nullable();
            $table->foreignId('room_member_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 24);
            $table->string('account', 8);
            $table->bigInteger('amount');
            $table->bigInteger('previous_balance');
            $table->bigInteger('new_balance');
            $table->timestamp('created_at')->nullable();
            $table->index(['game_session_id', 'account']);
        });

        Schema::create('game_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_room_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('version');
            $table->string('type', 32);
            $table->unsignedBigInteger('room_member_id')->nullable();
            $table->json('payload')->nullable();
            $table->string('idempotency_key', 64)->nullable();
            $table->timestamp('created_at')->nullable();
            // Rejects a retried request that carries a key this room has already processed.
            $table->unique(['game_room_id', 'idempotency_key']);
        });

        Schema::create('player_statistics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('games_played')->default(0);
            $table->unsignedInteger('games_won')->default(0);
            $table->unsignedInteger('bets_placed')->default(0);
            $table->unsignedInteger('bets_won')->default(0);
            $table->unsignedBigInteger('chips_won')->default(0);
            $table->unsignedBigInteger('chips_lost')->default(0);
            $table->unsignedBigInteger('biggest_win')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach ([
            'player_statistics', 'game_events', 'transactions', 'bets', 'turns', 'betting_cycles',
            'player_cards', 'rounds', 'game_sessions', 'room_members', 'game_settings', 'game_rooms',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
