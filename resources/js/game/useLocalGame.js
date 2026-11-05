import { useCallback, useEffect, useMemo, useState } from 'react';
import { FINISHED, GameEngine, stateViolations, viewFor } from './engine/engine.js';
import { GameRuleError, secureRandomizer } from './engine/rules.js';
import { makeSettings } from './engine/settings.js';

const STORAGE_KEY = 'betwixt.pass-and-play.v1';

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * The saved game, or null if there isn't a usable one. Storage can be unavailable in private
 * browsing, in which case the game still works until the page closes.
 */
export function loadSavedGame() {
    try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));

        if (!saved) {
            return null;
        }

        if (saved.state.phase === FINISHED || stateViolations(saved.state).length > 0) {
            return null;
        }

        // Whoever reopens the game may not be the player who was holding the device.
        return { ...saved, settings: makeSettings(saved.settings), confirmedActor: null };
    } catch {
        return null;
    }
}

function saveGame(game) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    } catch {
        // The game continues; it just can't be resumed after closing the page.
    }
}

export function clearSavedGame() {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing was saved in the first place.
    }
}

/**
 * Deals a new game. Seats follow the order the names were entered, going clockwise.
 */
export function newLocalGame(names, settingsInput, confirmHandoff) {
    const settings = makeSettings({ ...settingsInput, minPlayers: 2, maxPlayers: names.length });
    const players = names.map((name, index) => ({ id: index + 1, name }));
    const engine = GameEngine.begin(players, settings, secureRandomizer, nowSeconds(), players[0].id);

    return {
        settings,
        state: engine.state,
        confirmHandoff,
        confirmedActor: null,
        hues: players.map((player) => (player.id * 137) % 360),
    };
}

/**
 * Plays a game on this device. It offers the same interface as useGameRoom, so the same table
 * screens work for both, but runs the rules locally and needs no server or network.
 */
export default function useLocalGame(initial, onExit) {
    const [game, setGame] = useState(initial);
    const [error, setError] = useState(null);
    const { settings, state, hues, confirmHandoff, confirmedActor } = game;

    useEffect(() => saveGame(game), [game]);

    const engineNow = useCallback((from) => new GameEngine(from, settings, secureRandomizer, nowSeconds()), [settings]);
    const actor = useMemo(() => engineNow(state).currentActor(), [engineNow, state]);

    // Hidden hands require the next player to take the device first; open hands only if chosen.
    const handoffRequired = actor !== null
        && actor !== confirmedActor
        && (confirmHandoff || settings.cardVisibility === 'hidden');
    const viewer = handoffRequired ? null : actor;

    const confirmPlayer = useCallback(() => {
        setGame((current) => ({ ...current, confirmedActor: engineNow(current.state).currentActor() }));
    }, [engineNow]);

    // The reveal pause is the only timer. Nobody races a clock when sharing one device.
    const revealDeadline = state.turn?.stage === 'reveal' ? state.deadline : null;

    useEffect(() => {
        if (revealDeadline === null) {
            return undefined;
        }

        const timer = setTimeout(() => {
            setGame((current) => {
                const engine = engineNow(current.state);

                return engine.tick() ? { ...current, state: engine.state } : current;
            });
        }, Math.max(0, revealDeadline * 1000 - Date.now()) + 50);

        return () => clearTimeout(timer);
    }, [engineNow, revealDeadline]);

    const act = useCallback(async (action, amount = null) => {
        setError(null);
        const engine = engineNow(state);
        const current = engine.currentActor();

        try {
            switch (action) {
                case 'bet':
                    engine.placeBet(current, amount);
                    break;
                case 'pass':
                    engine.pass(current);
                    break;
                case 'reset':
                    engine.requestReset();
                    break;
                case 'continue':
                    engine.continueToNextRound();
                    break;
                case 'end':
                    engine.endGame();
                    break;
                default:
                    throw new Error(`Unknown action ${action}.`);
            }
        } catch (failure) {
            if (failure instanceof GameRuleError) {
                setError(failure.message);

                return null;
            }

            throw failure;
        }

        setGame((previous) => ({ ...previous, state: engine.state }));

        return true;
    }, [engineNow, state]);

    const room = useMemo(() => {
        const view = viewFor(state, settings, viewer, nowSeconds());

        return {
            mode: 'local',
            code: 'PASS & PLAY',
            name: 'Pass & Play',
            status: state.phase === FINISHED ? 'finished' : 'playing',
            settings,
            // Nobody is "you" on a shared device, so seats stay put and show names.
            you: null,
            isHost: true,
            members: state.seats.map((id, index) => ({
                id,
                name: state.players[id].name,
                hue: hues[index] ?? 150,
                isHost: false,
                connected: true,
            })),
            game: {
                ...view,
                // Betting has no countdown here, and a finished round waits for a tap.
                deadline: revealDeadline,
            },
        };
    }, [hues, revealDeadline, settings, state, viewer]);

    return {
        room,
        act,
        error,
        clearError: () => setError(null),
        busy: false,
        socketConnected: true,
        clockOffset: 0,
        leave: onExit,
        handoffTo: handoffRequired ? state.players[actor].name : null,
        confirmPlayer,
    };
}
