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
        Schema::create('visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('ip', 45)->index();
            $table->char('visitor_hash', 64);
            $table->string('path', 255);
            $table->string('route_name', 64)->nullable();
            $table->string('referrer', 255)->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->string('browser', 32);
            $table->string('os', 32);
            $table->string('device', 16);
            $table->string('language', 16)->nullable();
            $table->unsignedSmallInteger('status');
            $table->unsignedInteger('duration_ms')->nullable();
            // The day in the admin's timezone, stored so daily charts don't depend on database date functions.
            $table->date('visited_on');
            $table->timestamp('created_at')->nullable()->index();
            $table->index(['visited_on', 'device']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('visits');
    }
};
