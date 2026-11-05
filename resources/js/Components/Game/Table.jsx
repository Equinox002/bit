import { MotionConfig, motion } from 'framer-motion';
import { Layers, LogOut, RotateCcw, Settings2, Square, Wifi, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import BettingPanel from '@/Components/Game/BettingPanel';
import CenterStage from '@/Components/Game/CenterStage';
import { RoundHistory, RoundSummary } from '@/Components/Game/RoundOverlays';
import Seat from '@/Components/Game/Seat';
import { SettingsSummary } from '@/Components/Game/SettingsFields';
import TableChips from '@/Components/Game/TableChips';
import { Button, Dialog } from '@/Components/Game/ui';
import { GAME_NAME } from '@/game/brand';
import { chips, describeEvent, multiplierLabel } from '@/game/format';
import useSeatLayout from '@/game/useSeatLayout';

/**
 * Seats around an ellipse with the viewer at the bottom, so your own seat is always closest.
 */
function seatPositions(players, youId) {
    const start = Math.max(0, players.findIndex((player) => player.id === youId));
    const count = players.length;

    return players.map((player, index) => {
        const offset = (index - start + count) % count;
        const angle = (offset / count) * 2 * Math.PI;

        // Measured from the edges by each seat's own size, so no seat clips on any screen.
        return {
            player,
            angle,
            left: `calc(50% - ${Math.sin(angle).toFixed(4)} * (50% - var(--seat-x)))`,
            top: `calc(50% + ${Math.cos(angle).toFixed(4)} * (50% - var(--seat-y)))`,
        };
    });
}

function InfoDialog({ open, onClose, gameRoom, nameOf }) {
    const { room, act, busy, error } = gameRoom;
    const game = room.game;
    const [confirming, setConfirming] = useState(null);
    const log = useMemo(
        () => game.log.map((event) => describeEvent(event, nameOf)).filter(Boolean).reverse(),
        [game.log, nameOf],
    );

    const run = async (action) => {
        if (await act(action)) {
            setConfirming(null);
            onClose();
        }
    };

    return (
        <Dialog open={open} onClose={onClose} title="Table settings" wide>
            <div className="space-y-6">
                {room.isHost && (
                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-400">Host controls</h3>
                        {confirming ? (
                            <div className="rounded-xl border border-white/10 bg-ink-800 p-3">
                                <p className="mb-3 text-sm text-ivory-100">
                                    {confirming === 'reset'
                                        ? 'Start a new round now? Any accepted bets are settled first.'
                                        : room.mode === 'local'
                                            ? 'End this game? Open bets are refunded and the pot is split.'
                                            : 'End the game for everyone? Open bets are refunded and the pot is split.'}
                                </p>
                                <div className="flex gap-2">
                                    <Button variant="ghost" className="flex-1" onClick={() => setConfirming(null)}>Cancel</Button>
                                    <Button variant={confirming === 'end' ? 'danger' : 'primary'} className="flex-1" disabled={busy} onClick={() => run(confirming)}>
                                        {confirming === 'reset' ? 'Reset Round' : 'End Game'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 sm:flex-row">
                                {room.settings.allowManualReset && (
                                    <Button variant="secondary" className="flex-1" onClick={() => setConfirming('reset')}>
                                        <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset Round
                                    </Button>
                                )}
                                <Button variant="secondary" className="flex-1" onClick={() => setConfirming('end')}>
                                    <Square className="h-4 w-4" aria-hidden="true" /> End Game
                                </Button>
                            </div>
                        )}
                        {error && <p className="mt-2 text-sm text-loss-300">{error}</p>}
                    </section>
                )}

                <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-400">Rules</h3>
                    <SettingsSummary settings={room.settings} multiplierLabel={multiplierLabel} chips={chips} />
                </section>

                <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-400">Standings</h3>
                    <ul className="divide-y divide-white/5 text-sm">
                        {[...game.players].sort((a, b) => b.chips - a.chips).map((player) => (
                            <li key={player.id} className="flex justify-between gap-3 py-1.5">
                                <span className="truncate text-ivory-100">{player.name}</span>
                                <span className="shrink-0 tabular-nums text-ivory-200">
                                    {chips(player.chips)}{' '}
                                    <span className={player.net > 0 ? 'text-win-300' : player.net < 0 ? 'text-loss-300' : 'text-ivory-400'}>
                                        ({player.net > 0 ? '+' : ''}{chips(player.net)})
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>

                <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-400">Round history</h3>
                    <RoundHistory history={game.history} />
                </section>

                <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-400">Recent activity</h3>
                    <ul className="space-y-1 text-sm text-ivory-300">
                        {log.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
                    </ul>
                </section>
            </div>
        </Dialog>
    );
}

export default function Table({ gameRoom }) {
    const { room, leave, socketConnected, error, clearError, clockOffset } = gameRoom;
    const game = room.game;
    const [infoOpen, setInfoOpen] = useState(false);
    const [confirmExit, setConfirmExit] = useState(false);
    const [betPreview, setBetPreview] = useState(null);
    const { turn, lastResult } = game;
    const local = room.mode === 'local';

    const nameById = useMemo(() => Object.fromEntries(game.players.map((p) => [p.id, p.name])), [game.players]);
    const nameOf = useMemo(() => (id) => nameById[id] ?? 'A player', [nameById]);
    const membersById = Object.fromEntries(room.members.map((m) => [m.id, m]));
    const positions = seatPositions(game.players, room.you);
    const seatLayout = useSeatLayout(game.players.length);
    const revealing = turn?.stage === 'reveal' && lastResult?.turnNumber === turn.number;
    const statusText = game.phase === 'round_summary'
        ? 'Round over'
        : revealing
            ? 'Revealing'
            : 'Betting';
    const chipSpots = seatLayout.ready
        ? Object.fromEntries(positions.map(({ player, angle }) => [player.id, seatLayout.spotFor(angle)]))
        : {};
    const decidingId = turn?.stage === 'own_bet' ? turn.activeId : turn?.stage === 'invite' ? turn.askedId : null;

    return (
        <MotionConfig reducedMotion="user">
        <div className="flex h-dvh flex-col overflow-hidden bg-ink-950">
            <header className="z-20 flex items-center justify-between gap-2 border-b border-gold-600/25 bg-gradient-to-b from-ink-800 to-ink-900 px-2 py-1.5 shadow-card sm:px-4">
                <div className="flex min-w-0 items-center gap-2 text-xs sm:gap-4 sm:text-sm">
                    <span className={`whitespace-nowrap rounded-md border border-gold-500/40 bg-gold-500/10 px-1.5 py-0.5 font-bold text-gold-300 ${local ? '' : 'tracking-widest'}`} data-testid="nav-code">{room.code}</span>
                    <span className="whitespace-nowrap text-ivory-200">
                        Round {game.round?.number ?? 1}
                        {room.settings.maxCycles !== 1 && <span className="hidden sm:inline"> · Cycle {game.round?.cycle ?? 1}</span>}
                    </span>
                    <span className="hidden text-ivory-300 sm:inline" data-testid="game-status">{statusText}</span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-ivory-300" title="Cards left in the deck">
                        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                        <span data-testid="deck-count">{game.deckCount}</span>
                        <span className="sr-only">cards left in the deck</span>
                    </span>
                </div>
                <div className="flex shrink-0 items-center">
                    {!local && (
                        <span className="px-1.5" title={socketConnected ? 'Live connection' : 'Reconnecting; updates may be slower'}>
                            {socketConnected
                                ? <Wifi data-testid="live" className="h-4 w-4 text-win-400" aria-label="Live connection" />
                                : <WifiOff className="h-4 w-4 text-loss-400" aria-label="Reconnecting" />}
                        </span>
                    )}
                    <button type="button" aria-label="Settings" onClick={() => setInfoOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ivory-200 hover:bg-white/5">
                        <Settings2 className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button type="button" aria-label="Exit Game" onClick={() => setConfirmExit(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ivory-200 hover:bg-white/5">
                        <LogOut className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col short:flex-row">
            <div ref={seatLayout.ref} style={seatLayout.style} className="table-room relative min-h-0 flex-1 overflow-hidden">
                <div className="table-rail absolute inset-x-[9%] inset-y-[11%]">
                    <div className="table-felt">
                        <span aria-hidden="true" className="table-crest">{GAME_NAME}</span>
                    </div>
                </div>

                {revealing && (
                    <motion.div
                        key={lastResult.turnNumber}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-[9%] inset-y-[11%] rounded-full"
                        style={{ background: `radial-gradient(ellipse at center, ${lastResult.won ? 'rgb(226 189 98 / 0.55)' : 'rgb(220 38 38 / 0.4)'}, transparent 68%)` }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ delay: 0.55, duration: 1.4 }}
                    />
                )}

                <div className="absolute inset-0 flex items-center justify-center">
                    <CenterStage game={game} nameOf={nameOf} youId={room.you} settings={room.settings} large={seatLayout.large} />
                </div>

                <TableChips
                    game={game}
                    revealing={revealing}
                    spots={chipSpots}
                    nameOf={nameOf}
                    compact={seatLayout.compact}
                    large={seatLayout.large}
                    preview={betPreview}
                />

                {positions.map(({ player, left, top }) => (
                    <div
                        key={player.id}
                        className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                        style={{ left, top }}
                    >
                        <Seat
                            compact={seatLayout.compact}
                            large={seatLayout.large}
                            timer={decidingId === player.id && game.deadline ? { deadline: game.deadline, clockOffset, total: room.settings.turnTimeout } : null}
                            player={player}
                            member={membersById[player.id]}
                            isYou={player.id === room.you}
                            isActive={turn?.activeId === player.id}
                            isAsked={turn?.askedId === player.id}
                            isDealer={game.round?.dealerId === player.id}
                            declined={turn?.declined.includes(player.id)}
                            showDelta={revealing}
                            outcome={revealing ? lastResult.outcomes.find((o) => o.playerId === player.id) : null}
                        />
                    </div>
                ))}
            </div>

            {/* Held sideways, a phone has no height to spare, so the panel moves beside the table. */}
            <div className="flex shrink-0 flex-col short:w-[290px] short:overflow-y-auto short:border-l short:border-gold-600/30 short:bg-ink-950">
                {error && (
                    <button type="button" onClick={clearError} className="bg-loss-600/90 px-3 py-2 text-center text-sm text-white" role="alert">
                        {error}
                    </button>
                )}

                <BettingPanel gameRoom={gameRoom} nameOf={nameOf} onPreview={setBetPreview} />
            </div>
            </div>

            {game.phase === 'round_summary' && game.lastSummary && <RoundSummary gameRoom={gameRoom} nameOf={nameOf} />}

            <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} gameRoom={gameRoom} nameOf={nameOf} />

            <Dialog open={confirmExit} onClose={() => setConfirmExit(false)} title="Exit this game?">
                <p className="mb-4 text-sm text-ivory-200">
                    {local
                        ? 'This game is saved on this device, so you can resume it from the Pass & Play screen.'
                        : "You'll give up your seat and any share of the pot, and you can't rejoin this game. Any bets you've already placed still settle. To step away briefly, just close the page and reopen the link."}
                </p>
                <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => setConfirmExit(false)}>Stay</Button>
                    <Button variant={local ? 'primary' : 'danger'} className="flex-1" onClick={leave}>{local ? 'Save & Exit' : 'Exit Game'}</Button>
                </div>
            </Dialog>
        </div>
        </MotionConfig>
    );
}
