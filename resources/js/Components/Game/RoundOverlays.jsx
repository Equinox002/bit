import { Link } from '@inertiajs/react';
import { Play, Plus, Trophy } from 'lucide-react';
import { ChipStack } from '@/Components/Game/PokerChip';
import { Button, Dialog, buttonClass } from '@/Components/Game/ui';
import { chips, finishReason, resetReason } from '@/game/format';
import useCountdown from '@/game/useCountdown';

function Stat({ label, value, tone = 'text-ivory-50' }) {
    return (
        <div className="rounded-lg bg-ink-800 px-3 py-2">
            <dt className="text-xs text-ivory-400">{label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</dd>
        </div>
    );
}

function Signed({ value }) {
    if (value === 0) {
        return <span className="text-ivory-400">0</span>;
    }

    return value > 0
        ? <span className="text-win-300">+{chips(value)}</span>
        : <span className="text-loss-300">−{chips(-value)}</span>;
}

export function RoundHistory({ history }) {
    if (history.length === 0) {
        return <p className="text-sm text-ivory-400">No rounds finished yet.</p>;
    }

    return (
        <ul className="divide-y divide-white/5 text-sm">
            {[...history].reverse().map((round) => (
                <li key={round.number} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0">
                        <span className="font-medium text-ivory-100">Round {round.number}</span>
                        <span className="block truncate text-xs text-ivory-400">{resetReason(round.reason)}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-ivory-200">
                        {chips(round.startingPot)} → {chips(round.endingPot)}
                    </span>
                </li>
            ))}
        </ul>
    );
}

export function RoundSummary({ gameRoom, nameOf }) {
    const { room, act, busy, clockOffset } = gameRoom;
    const { lastSummary: summary, deadline, history } = room.game;
    const seconds = useCountdown(deadline, clockOffset);

    return (
        <Dialog open title={`Round ${summary.number} summary`} wide>
            <p data-testid="summary-reason" className="mb-3 text-sm text-ivory-300">{resetReason(summary.reason)}.</p>

            {summary.endingPot > 0 && (
                <div className="mb-3 flex items-end justify-center gap-3 rounded-xl border border-gold-600/25 bg-felt-800/60 px-3 py-3">
                    <ChipStack amount={summary.endingPot} spread={3} size={34} maxColumns={4} maxPerColumn={7} />
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-300/80">Left in the pot</div>
                        <div className="font-display text-3xl font-bold leading-none tabular-nums lining-nums text-gold-300">{chips(summary.endingPot)}</div>
                    </div>
                </div>
            )}

            <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="Starting pot" value={chips(summary.startingPot)} />
                <Stat label="Ending pot" value={chips(summary.endingPot)} tone="text-gold-300" />
                <Stat label="Cards drawn" value={summary.cardsDrawn} />
                <Stat label="Winning bets" value={chips(summary.winningBets)} tone="text-win-300" />
                <Stat label="Losing bets" value={chips(summary.losingBets)} tone="text-loss-300" />
                <Stat label="Betting cycles" value={summary.cycles} />
            </dl>

            <div className="mb-4 overflow-hidden rounded-lg border border-white/10">
                <table className="w-full text-sm">
                    <thead className="bg-ink-800 text-xs uppercase tracking-wide text-ivory-400">
                        <tr>
                            <th scope="col" className="px-3 py-2 text-left font-medium">Player</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">This round</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Chips</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {summary.players.map((player) => (
                            <tr key={player.playerId}>
                                <td className="max-w-[9rem] truncate px-3 py-2 text-ivory-100">{nameOf(player.playerId)}</td>
                                <td className="px-3 py-2 text-right tabular-nums"><Signed value={player.won - player.lost} /></td>
                                <td className="px-3 py-2 text-right tabular-nums text-ivory-50">{chips(player.chips)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {history.length > 1 && (
                <details className="mb-4">
                    <summary className="cursor-pointer text-sm text-gold-300">Earlier rounds</summary>
                    <div className="mt-2"><RoundHistory history={history} /></div>
                </details>
            )}

            {(() => {
                const { contribution, contributeEveryRound } = room.settings;
                const paying = contribution > 0 && (contributeEveryRound || summary.endingPot === 0);

                if (!paying && summary.endingPot === 0) {
                    return null;
                }

                return (
                    <p data-testid="next-round-note" className="mb-3 text-sm text-ivory-300">
                        {summary.endingPot > 0 && `The ${chips(summary.endingPot)} chips left in the pot carry into the next round`}
                        {summary.endingPot > 0 && paying && ', and '}
                        {summary.endingPot === 0 && paying && 'The pot is empty, so '}
                        {paying && `each player adds ${chips(contribution)} chips`}.
                    </p>
                );
            })()}

            {room.isHost ? (
                <Button className="w-full" disabled={busy} onClick={() => act('continue')}>
                    <Play className="h-4 w-4" aria-hidden="true" /> Deal Next Round{seconds !== null ? ` (${seconds}s)` : ''}
                </Button>
            ) : (
                <p className="rounded-xl bg-ink-800 px-3 py-3 text-center text-sm text-ivory-200">
                    Next round starts {seconds !== null ? `in ${seconds}s` : 'soon'}, or when the host deals.
                </p>
            )}
        </Dialog>
    );
}

/**
 * Children replace the default actions, for games that can't link to server pages.
 */
export function GameOver({ game, children }) {
    const { final, history, pot } = game;
    const top = final.standings[0];

    return (
        <div className="mx-auto w-full max-w-xl space-y-4 py-6">
            <div className="text-center">
                <Trophy className="mx-auto mb-2 h-10 w-10 text-gold-400" aria-hidden="true" />
                <h1 data-testid="game-over" className="font-display text-3xl font-bold text-ivory-50">Game over</h1>
                <p className="mt-1 text-sm text-ivory-300">{finishReason(final.reason)}.</p>
                {top && (
                    <>
                        <ChipStack amount={top.chips} spread={5} size={40} maxColumns={4} maxPerColumn={8} className="mt-3" />
                        <p className="mt-2 break-words text-lg text-gold-300">{top.name} finishes on top with {chips(top.chips)} chips</p>
                    </>
                )}
            </div>

            {final.share > 0 && (
                <p className="rounded-lg bg-ink-800 px-3 py-2 text-center text-sm text-ivory-200">
                    The remaining pot was split: {chips(final.share)} chips each{pot > 0 ? `, with ${chips(pot)} left undivided` : ''}.
                </p>
            )}

            <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-900">
                <table className="w-full text-sm">
                    <thead className="bg-ink-800 text-xs uppercase tracking-wide text-ivory-400">
                        <tr>
                            <th scope="col" className="px-3 py-2 text-left font-medium">Player</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Won</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Lost</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Net</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Chips</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {final.standings.map((player) => (
                            <tr key={player.playerId}>
                                <td className="max-w-[7rem] truncate px-3 py-2 text-ivory-100">{player.name}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-ivory-200">{chips(player.totalWon)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-ivory-200">{chips(player.totalLost)}</td>
                                <td className="px-3 py-2 text-right tabular-nums"><Signed value={player.net} /></td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums text-ivory-50">{chips(player.chips)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {history.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-ink-900 p-4">
                    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gold-400">Rounds</h2>
                    <RoundHistory history={history} />
                </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
                {children ?? (
                    <>
                        <Link href={route('rooms.create')} className={buttonClass('primary', 'flex-1')}>
                            <Plus className="h-4 w-4" aria-hidden="true" /> New Game
                        </Link>
                        <Link href={route('home')} className={buttonClass('secondary', 'flex-1')}>Home</Link>
                    </>
                )}
            </div>
        </div>
    );
}
