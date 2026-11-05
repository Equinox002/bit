import { Head, Link } from '@inertiajs/react';
import PlayingCard from '@/Components/Game/PlayingCard';
import { Panel, buttonClass } from '@/Components/Game/ui';
import { GAME_NAME } from '@/game/brand';
import SiteLayout from '@/Layouts/SiteLayout';

function Section({ title, children }) {
    return (
        <Panel className="p-5 sm:p-6">
            <h2 className="mb-3 font-display text-xl text-ivory-50">{title}</h2>
            <div className="space-y-3 text-sm leading-relaxed text-ivory-200">{children}</div>
        </Panel>
    );
}

export default function HowToPlay() {
    return (
        <SiteLayout>
            <Head title="How to Play" />
            <div className="mx-auto max-w-3xl space-y-4 py-4">
                <h1 className="font-display text-3xl font-bold text-ivory-50 sm:text-4xl">How to play {GAME_NAME}</h1>

                <Section title="Your cards set your range">
                    <p>Each player holds two cards from a standard 52-card deck. The ranks between them are that player's winning range. Suits never matter.</p>
                    <div className="flex items-center gap-3">
                        <PlayingCard card="AH" size="sm" />
                        <PlayingCard card="5C" size="sm" />
                        <p>A and 5 win on 2, 3 or 4. By default a card matching either boundary loses, and the Ace is low.</p>
                    </div>
                    <p>Consecutive or identical cards have no winning range, so that player's turn is skipped.</p>
                </Section>

                <Section title="A turn, step by step">
                    <ol className="list-inside list-decimal space-y-1">
                        <li>The active player chooses how much to bet on their own range, or skips.</li>
                        <li>The next player clockwise is asked whether to bet on the same range, then the next, and so on.</li>
                        <li>Asking stops once the pot can't cover any more bets, or everyone has answered.</li>
                        <li>Bets lock and exactly one card is drawn.</li>
                        <li>The turn moves to the next seat clockwise, whoever won or lost.</li>
                    </ol>
                    <p>Nobody is ever forced to bet. If nobody bets, no card is drawn.</p>
                </Section>

                <Section title="The pot and payouts">
                    <p>Bets are limited by what the pot can pay out, so the pot can never go negative. Here's a three-player example with a pot of 30 at the standard 2x:</p>
                    <div className="overflow-hidden rounded-lg border border-white/10">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-ink-800 text-xs uppercase tracking-wide text-ivory-400">
                                <tr>
                                    <th scope="col" className="px-3 py-2 font-medium">Bets</th>
                                    <th scope="col" className="px-3 py-2 font-medium">Drawn</th>
                                    <th scope="col" className="px-3 py-2 font-medium">Result</th>
                                    <th scope="col" className="px-3 py-2 font-medium">Pot</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                <tr>
                                    <td className="px-3 py-2">10 and 20</td>
                                    <td className="px-3 py-2">3</td>
                                    <td className="px-3 py-2 text-win-300">Paid 20 and 40</td>
                                    <td className="px-3 py-2">0</td>
                                </tr>
                                <tr>
                                    <td className="px-3 py-2">10 and 20</td>
                                    <td className="px-3 py-2">9</td>
                                    <td className="px-3 py-2 text-loss-300">Both lose their stake</td>
                                    <td className="px-3 py-2">60</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Section>

                <Section title="Rounds and resets">
                    <p>A round lasts until every player has had their turn, then new cards are dealt. A host can allow more turns with the same cards when creating a room. A round also ends early if:</p>
                    <ul className="list-inside list-disc space-y-1">
                        <li>the pot is empty</li>
                        <li>the deck runs out</li>
                        <li>no hand can win with the cards left</li>
                        <li>most hands are narrow (a gap of two or fewer ranks)</li>
                        <li>the host resets the round</li>
                    </ul>
                    <p>Anything left in the pot carries into the next round, and each player adds their contribution on top. With 40 left and three players contributing 10 each, the next round starts at 70. Anyone who can't afford the contribution sits that round out.</p>
                    <p>If the pot has less than the minimum bet, you can bet whatever is left.</p>
                </Section>

                <Section title="Good to know">
                    <ul className="list-inside list-disc space-y-1">
                        <li>The host can change almost every rule when creating a room.</li>
                        <li>Pass &amp; Play lets everyone share one device, with no internet or account needed. The game is saved on that device.</li>
                        <li>If you run out of time or lose your connection on your go, you simply pass. Reopen the link to return to your seat.</li>
                        <li>The game uses virtual chips only. They have no cash value and can't be bought or withdrawn.</li>
                    </ul>
                </Section>

                <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                    <Link href={route('rooms.create')} className={buttonClass('primary')}>Create Room</Link>
                    <Link href={route('join.index')} className={buttonClass('secondary')}>Join Room</Link>
                </div>
            </div>
        </SiteLayout>
    );
}
