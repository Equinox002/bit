import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { newActionKey } from './format';

const HEARTBEAT_MS = 15000;
const POLL_WHILE_DISCONNECTED_MS = 3000;

// Without a limit, a request lost on a flaky phone network would leave the player's view stuck.
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Keeps one player's view of a room in sync. The server is the only authority: every change
 * comes from a response or a fetch, and a socket ping only says that a newer version exists.
 */
export default function useGameRoom(initial) {
    const [room, setRoom] = useState(initial);
    const [socketConnected, setSocketConnected] = useState(false);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [clockOffset, setClockOffset] = useState(() => offsetFrom(initial));

    const versionRef = useRef(initial.version);
    const tokenRef = useRef(initial.realtime.token);
    const code = initial.code;

    const apply = useCallback((next) => {
        if (next.version < versionRef.current) {
            return;
        }

        versionRef.current = next.version;
        tokenRef.current = next.realtime.token;
        setRoom(next);
        setClockOffset(offsetFrom(next));
    }, []);

    const handleFatal = useCallback((status) => {
        if (status === 401 || status === 403) {
            window.location.assign(route('join.show', code));
        } else if (status === 419) {
            window.location.reload();
        }
    }, [code]);

    // Fetches never overlap, and pings that arrive during one trigger exactly one more.
    const inFlight = useRef(false);
    const again = useRef(false);

    const refresh = useCallback(async () => {
        if (inFlight.current) {
            again.current = true;
            return;
        }

        inFlight.current = true;

        try {
            const { data } = await axios.get(route('rooms.state', code), { timeout: REQUEST_TIMEOUT_MS });
            apply(data);
        } catch (failure) {
            handleFatal(failure.response?.status);
        } finally {
            inFlight.current = false;

            if (again.current) {
                again.current = false;
                refresh();
            }
        }
    }, [apply, code, handleFatal]);

    useEffect(() => {
        const { url, port, enabled } = initial.realtime;

        if (!enabled) {
            return undefined;
        }

        const socket = io(url || `${window.location.protocol}//${window.location.hostname}:${port}`, {
            auth: (callback) => callback({ token: tokenRef.current }),
            reconnectionDelayMax: 5000,
        });

        socket.on('connect', () => {
            setSocketConnected(true);
            refresh();
        });
        socket.on('disconnect', () => setSocketConnected(false));
        socket.on('connect_error', () => setSocketConnected(false));
        socket.on('game:state-updated', ({ version }) => {
            if (version > versionRef.current) {
                refresh();
            }
        });

        return () => socket.disconnect();
    }, [initial.realtime, refresh]);

    const heartbeat = useCallback(async () => {
        try {
            const { data } = await axios.post(route('rooms.heartbeat', code), {}, { timeout: REQUEST_TIMEOUT_MS });

            if (data.version > versionRef.current) {
                refresh();
            }
        } catch (failure) {
            handleFatal(failure.response?.status);
        }
    }, [code, handleFatal, refresh]);

    useEffect(() => {
        heartbeat();
        const timer = setInterval(heartbeat, HEARTBEAT_MS);

        // Phones pause timers in the background, so catch up as soon as the page is visible again.
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                heartbeat();
                refresh();
            }
        };

        document.addEventListener('visibilitychange', onVisible);

        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [heartbeat, refresh]);

    useEffect(() => {
        if (socketConnected || !['lobby', 'playing'].includes(room.status)) {
            return undefined;
        }

        const timer = setInterval(refresh, POLL_WHILE_DISCONNECTED_MS);

        return () => clearInterval(timer);
    }, [refresh, room.status, socketConnected]);

    // Asks the server to enforce a deadline once it passes. The server checks its own clock.
    const deadline = room.game?.deadline;

    useEffect(() => {
        if (!deadline) {
            return undefined;
        }

        const wait = deadline * 1000 - (Date.now() + clockOffset) + 150 + Math.random() * 400;
        const timer = setTimeout(heartbeat, Math.max(wait, 0));

        return () => clearTimeout(timer);
    }, [clockOffset, deadline, heartbeat, room.version]);

    const post = useCallback(async (url, payload) => {
        setBusy(true);
        setError(null);

        try {
            const { data } = await requestWithRetry(url, payload);
            apply(data);

            return data;
        } catch (failure) {
            const status = failure.response?.status;
            handleFatal(status);
            setError(
                status === 429
                    ? 'Too many requests. Wait a moment and try again.'
                    : failure.response?.data?.message ?? 'Could not reach the server. Check your connection.',
            );
            refresh();

            return null;
        } finally {
            setBusy(false);
        }
    }, [apply, handleFatal, refresh]);

    const act = useCallback(
        (action, amount = null) => post(route('rooms.actions', code), { action, amount, key: newActionKey() }),
        [code, post],
    );

    const start = useCallback(() => post(route('rooms.start', code), {}), [code, post]);

    const updateSettings = useCallback(
        (preset, settings) => post(route('rooms.settings', code), { preset, settings }),
        [code, post],
    );

    const leave = useCallback(async () => {
        try {
            await axios.post(route('rooms.leave', code));
        } finally {
            window.location.assign(route('home'));
        }
    }, [code]);

    return {
        room,
        socketConnected,
        error,
        clearError: () => setError(null),
        busy,
        clockOffset,
        act,
        start,
        updateSettings,
        leave,
    };
}

function offsetFrom(room) {
    return room.game?.serverTime ? room.game.serverTime * 1000 - Date.now() : 0;
}

/**
 * Network failures retry with the same idempotency key, so a bet can never apply twice.
 */
async function requestWithRetry(url, payload) {
    const options = { timeout: REQUEST_TIMEOUT_MS };

    try {
        return await axios.post(url, payload, options);
    } catch (failure) {
        if (failure.response) {
            throw failure;
        }

        return axios.post(url, payload, options);
    }
}
