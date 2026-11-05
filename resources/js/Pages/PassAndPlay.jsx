import { Head, Link } from '@inertiajs/react';
import { Globe, Play, Plus, Smartphone, Trash2, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GameOver } from '@/Components/Game/RoundOverlays';
import {
    AdvancedSettings,
    BettingSettings,
    PlayerChipSettings,
    Toggle,
} from '@/Components/Game/SettingsFields';
import Table from '@/Components/Game/Table';
import { Button, Dialog, Logo, Panel, buttonClass } from '@/Components/Game/ui';
import { GAME_NAME } from '@/game/brand';
import { InvalidSettingsError, MAX_SEATS, presetValues } from '@/game/engine/settings.js';
import useLocalGame, { clearSavedGame, loadSavedGame, newLocalGame } from '@/game/useLocalGame';

const NAME_LIMIT = 24;

function useOnline() {
    const [online, setOnline] = useState(() => navigator.onLine);

    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);

        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    return online;
}

/**
 * Links to server pages are hidden while offline, because they couldn't open.
 */
function Shell({ children }) {
    const online = useOnline();

    return (
        <div className="flex min-h-dvh flex-col overflow-x-hidden bg-gradient-to-b from-felt-950 via-ink-950 to-ink-950">
            <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                    <Logo />
                    <span className="font-display text-xl text-ivory-50">{GAME_NAME}</span>
                </div>
                {online ? (
                    <Link href={route('home')} className={buttonClass('ghost')}>
                        <Globe className="h-4 w-4" aria-hidden="true" /> Online Play
                    </Link>
                ) : (
                    <span data-testid="offline-badge" className="rounded-full border border-white/15 px-3 py-1 text-xs text-ivory-300">Offline</span>
                )}
            </header>
            <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10">{children}</main>
        </div>
    );
}

function Setup({ saved, onStart, onResume, onDiscard }) {
    const presets = useMemo(() => presetValues(), []);
    const [names, setNames] = useState(['', '', '']);
    const [preset, setPreset] = useState('classic');
    const [settings, setSettings] = useState(presets.classic);
    const [confirmHandoff, setConfirmHandoff] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState(null);
    const set = (key) => (value) => setSettings((current) => ({ ...current, [key]: value }));

    const choosePreset = (key) => {
        setPreset(key);
        setSettings(presets[key]);
        setShowRules(key === 'custom');
    };

    const start = () => {
        const trimmed = names.map((name) => name.trim());
        const filled = trimmed.filter(Boolean);
        setErrors({});

        if (filled.length < 2) {
            setFormError('Enter at least two player names.');

            return;
        }

        if (new Set(filled.map((name) => name.toLowerCase())).size !== filled.length) {
            setFormError('Each player needs a different name.');

            return;
        }

        try {
            setFormError(null);
            onStart(newLocalGame(filled, settings, confirmHandoff));
        } catch (failure) {
            if (!(failure instanceof InvalidSettingsError)) {
                throw failure;
            }

            setShowRules(true);
            setFormError('Check the highlighted rules.');
            setErrors(Object.fromEntries(Object.entries(failure.errors).map(([field, message]) => [`settings.${field}`, message])));
        }
    };

    return (
        <Shell>
            <Head title="Pass & Play" />
            <h1 className="font-display text-3xl font-bold text-ivory-50">Pass &amp; Play</h1>
            <p className="mt-1 text-sm text-ivory-300">Everyone shares this one device, with no internet needed.</p>

            {saved && (
                <Panel className="mt-4 border-gold-500/40 p-4">
                    <p className="font-medium text-ivory-50">Game in progress</p>
                    <p className="mb-3 break-words text-sm text-ivory-300">
                        Round {saved.state.round?.number ?? 1} with {Object.values(saved.state.players).map((player) => player.name).join(', ')}
                    </p>
                    <div className="flex gap-2">
                        <Button className="flex-1" onClick={onResume}>
                            <Play className="h-4 w-4" aria-hidden="true" /> Resume Game
                        </Button>
                        <Button variant="secondary" onClick={onDiscard}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" /> Discard
                        </Button>
                    </div>
                </Panel>
            )}

            <Panel className="mt-4 p-5">
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-gold-400">Players</h2>
                <p className="mb-3 text-xs text-ivory-400">Enter names in seating order, going clockwise.</p>
                <ul className="space-y-2">
                    {names.map((name, index) => (
                        // Seats are positions in this list, so the index is the right key here.
                        // eslint-disable-next-line react/no-array-index-key
                        <li key={index} className="flex items-center gap-2">
                            <span className="w-5 shrink-0 text-right text-sm tabular-nums text-ivory-400">{index + 1}</span>
                            <input
                                type="text"
                                aria-label={`Player ${index + 1} name`}
                                value={name}
                                maxLength={NAME_LIMIT}
                                autoComplete="off"
                                onChange={(event) => setNames(names.map((current, i) => (i === index ? event.target.value : current)))}
                                className="min-h-11 w-full min-w-0 rounded-lg border border-white/15 bg-ink-800 px-3 text-sm text-ivory-50 focus:border-gold-400 focus:ring-gold-400"
                            />
                            {names.length > 2 && (
                                <button
                                    type="button"
                                    aria-label={`Remove player ${index + 1}`}
                                    onClick={() => setNames(names.filter((_, i) => i !== index))}
                                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ivory-300 hover:bg-white/5"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
                {names.length < MAX_SEATS && (
                    <Button variant="ghost" className="mt-2 w-full" onClick={() => setNames([...names, ''])}>
                        <UserPlus className="h-4 w-4" aria-hidden="true" /> Add Player
                    </Button>
                )}
            </Panel>

            <Panel className="mt-4 p-5">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gold-400">Game type</h2>
                <div className="grid grid-cols-3 gap-2">
                    {[['quick', 'Quick'], ['classic', 'Classic'], ['custom', 'Custom']].map(([key, title]) => (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={preset === key}
                            onClick={() => choosePreset(key)}
                            className={`min-h-11 rounded-xl border px-2 text-sm font-semibold transition ${preset === key ? 'border-gold-400 bg-gold-500/10 text-ivory-50' : 'border-white/10 bg-ink-800 text-ivory-200 hover:border-white/25'}`}
                        >
                            {title}
                        </button>
                    ))}
                </div>

                <div className="mt-4">
                    {settings.cardVisibility === 'hidden' ? (
                        <p className="text-xs text-ivory-400">With hidden cards, a pass screen always appears between players.</p>
                    ) : (
                        <Toggle label="Show a pass screen between players" hint="Asks each player to take the device before they decide" value={confirmHandoff} onChange={setConfirmHandoff} />
                    )}
                </div>

                <button type="button" onClick={() => setShowRules(!showRules)} className="mt-4 text-sm text-gold-300 underline underline-offset-2">
                    {showRules ? 'Hide rules' : 'Change rules'}
                </button>

                {showRules && (
                    <div className="mt-5 space-y-8">
                        <PlayerChipSettings values={settings} set={set} errors={errors} local />
                        <BettingSettings values={settings} set={set} errors={errors} />
                        <AdvancedSettings values={settings} set={set} errors={errors} local />
                    </div>
                )}
            </Panel>

            {formError && <p role="alert" className="mt-3 rounded-lg bg-loss-600/15 px-3 py-2 text-sm text-loss-300">{formError}</p>}

            <Button className="mt-4 w-full text-base" onClick={start}>
                <Smartphone className="h-4 w-4" aria-hidden="true" /> {saved ? 'Start New Game' : 'Start Game'}
            </Button>
            {saved && <p className="mt-2 text-center text-xs text-ivory-400">Starting a new game replaces the one in progress.</p>}
        </Shell>
    );
}

/**
 * Fully opaque, so the next player can't see the screen until they have the device.
 */
function HandoffScreen({ name, onConfirm }) {
    return (
        <div data-testid="handoff" className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-felt-950 p-6 text-center">
            <Smartphone className="h-12 w-12 text-gold-400" aria-hidden="true" />
            <div>
                <p className="text-sm uppercase tracking-[0.25em] text-ivory-300">Pass the device to</p>
                <p className="mt-2 break-words font-display text-4xl font-bold text-ivory-50">{name}</p>
            </div>
            <Button className="min-w-48 text-base" onClick={onConfirm}>I'm {name}</Button>
        </div>
    );
}

function LocalTable({ game, onExit, onNewGame }) {
    const gameRoom = useLocalGame(game, onExit);
    const { room, handoffTo, confirmPlayer } = gameRoom;

    if (room.status === 'finished') {
        return (
            <Shell>
                <Head title="Pass & Play" />
                <GameOver game={room.game}>
                    <Button className="flex-1" onClick={onNewGame}>
                        <Plus className="h-4 w-4" aria-hidden="true" /> New Game
                    </Button>
                </GameOver>
            </Shell>
        );
    }

    return (
        <>
            <Head title="Pass & Play" />
            <Table gameRoom={gameRoom} />
            {handoffTo && <HandoffScreen name={handoffTo} onConfirm={confirmPlayer} />}
        </>
    );
}

export default function PassAndPlay() {
    const [saved, setSaved] = useState(() => loadSavedGame());
    const [playing, setPlaying] = useState(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);

    const backToSetup = () => {
        setSaved(loadSavedGame());
        setPlaying(null);
    };

    const discard = () => {
        clearSavedGame();
        setSaved(null);
        setConfirmDiscard(false);
    };

    if (playing) {
        return (
            <LocalTable
                // A new game must start from fresh state rather than reuse the previous hook's.
                key={playing.id}
                game={playing.game}
                onExit={backToSetup}
                onNewGame={() => {
                    clearSavedGame();
                    backToSetup();
                }}
            />
        );
    }

    return (
        <>
            <Setup
                saved={saved}
                onStart={(game) => setPlaying({ id: Date.now(), game })}
                onResume={() => setPlaying({ id: Date.now(), game: saved })}
                onDiscard={() => setConfirmDiscard(true)}
            />
            <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)} title="Discard this game?">
                <p className="mb-4 text-sm text-ivory-200">The game in progress will be deleted from this device.</p>
                <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => setConfirmDiscard(false)}>Keep It</Button>
                    <Button variant="danger" className="flex-1" onClick={discard}>Discard</Button>
                </div>
            </Dialog>
        </>
    );
}
