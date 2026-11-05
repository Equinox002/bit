<?php

use App\Http\Controllers\Admin\OverviewController as AdminOverviewController;
use App\Http\Controllers\Admin\RoomController as AdminRoomController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\Admin\VisitController as AdminVisitController;
use App\Http\Controllers\GameActionController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\JoinController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\RoomController;
use App\Providers\RouteServiceProvider;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| contains the "web" middleware group. Now create something great!
|
*/

Route::get('/', [HomeController::class, 'index'])->name('home');
Route::get('/how-to-play', fn () => Inertia::render('HowToPlay'))->name('how-to-play');
Route::get('/pass-and-play', fn () => Inertia::render('PassAndPlay'))->name('pass-and-play');

Route::get('/play', [RoomController::class, 'play'])->name('play');
Route::get('/rooms/create', [RoomController::class, 'create'])->name('rooms.create');
Route::post('/rooms', [RoomController::class, 'store'])->middleware('throttle:room-create')->name('rooms.store');

Route::get('/join', [JoinController::class, 'index'])->name('join.index');
Route::post('/join', [JoinController::class, 'lookup'])->middleware('throttle:room-join')->name('join.lookup');
Route::get('/join/{code}', [JoinController::class, 'show'])->name('join.show');
Route::post('/join/{code}', [JoinController::class, 'store'])->middleware('throttle:room-join')->name('join.store');

Route::get('/rooms/{room:code}', [RoomController::class, 'show'])->name('rooms.show');

Route::middleware('auth')->prefix('/rooms/{room:code}')->name('rooms.')->group(function () {
    Route::get('/state', [RoomController::class, 'state'])->middleware('throttle:game-state')->name('state');

    Route::middleware('throttle:game-actions')->group(function () {
        Route::post('/settings', [RoomController::class, 'updateSettings'])->name('settings');
        Route::post('/start', [RoomController::class, 'start'])->name('start');
        Route::post('/leave', [RoomController::class, 'leave'])->name('leave');
        Route::post('/actions', [GameActionController::class, 'act'])->name('actions');
        Route::post('/heartbeat', [GameActionController::class, 'heartbeat'])->name('heartbeat');
    });
});

Route::get('/dashboard', fn () => redirect(RouteServiceProvider::HOME))->middleware('auth')->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

Route::middleware(['auth', 'admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::get('/', AdminOverviewController::class)->name('overview');
    Route::get('/visits', AdminVisitController::class)->name('visits');
    Route::get('/users', AdminUserController::class)->name('users');
    Route::get('/rooms', AdminRoomController::class)->name('rooms');
});

require __DIR__.'/auth.php';
