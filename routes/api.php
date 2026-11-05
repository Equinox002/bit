<?php

use App\Http\Controllers\RealtimePresenceController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});

// All presence traffic comes from the relay's one address, so the per-IP limit doesn't apply.
Route::post('/internal/realtime/presence', RealtimePresenceController::class)
    ->withoutMiddleware('throttle:api')
    ->name('realtime.presence');
