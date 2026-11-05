const crypto = require('node:crypto');
const http = require('node:http');
const { Server } = require('socket.io');

const MAX_BODY_BYTES = 64 * 1024;

/**
 * The Socket.IO relay. It holds no game logic and no game data: Laravel tells it that a room
 * changed, it pings that room's sockets, and each browser then fetches its own filtered state.
 * Clients can only listen. Every game command goes to Laravel over HTTP.
 */
function createRelay({ secret, appUrl, corsOrigin = '*', fetchImpl = fetch }) {
    if (!secret) {
        throw new Error('REALTIME_SECRET must be set.');
    }

    const server = http.createServer((request, response) => handleHttp(request, response));
    const io = new Server(server, {
        cors: { origin: corsOrigin },
        maxHttpBufferSize: 10 * 1024,
    });

    // Connection counts per member, because one player may have several tabs or devices open.
    const connections = new Map();

    io.use((socket, next) => {
        const claims = verifyToken(socket.handshake.auth?.token, secret);

        if (!claims) {
            next(new Error('unauthorized'));
            return;
        }

        socket.data.room = claims.room;
        socket.data.member = claims.member;
        next();
    });

    io.on('connection', (socket) => {
        const { room, member } = socket.data;
        const key = `${room}:${member}`;
        const count = (connections.get(key) ?? 0) + 1;

        connections.set(key, count);
        socket.join(room);

        if (count === 1) {
            reportPresence(room, member, true);
        }

        socket.on('disconnect', () => {
            const remaining = (connections.get(key) ?? 1) - 1;

            if (remaining > 0) {
                connections.set(key, remaining);
                return;
            }

            connections.delete(key);
            reportPresence(room, member, false);
        });
    });

    function reportPresence(room, member, connected) {
        if (!appUrl) {
            return;
        }

        fetchImpl(`${appUrl.replace(/\/$/, '')}/api/internal/realtime/presence`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Realtime-Secret': secret,
            },
            body: JSON.stringify({ room, member, connected }),
        }).catch((error) => console.warn(`Presence report failed: ${error.message}`));
    }

    function handleHttp(request, response) {
        if (request.method === 'GET' && request.url === '/health') {
            respond(response, 200, { ok: true, sockets: io.engine.clientsCount });
            return;
        }

        if (request.method !== 'POST' || request.url !== '/publish') {
            respond(response, 404, { error: 'not_found' });
            return;
        }

        if (!secretsMatch(request.headers['x-realtime-secret'], secret)) {
            respond(response, 403, { error: 'forbidden' });
            return;
        }

        readJson(request)
            .then((body) => {
                if (typeof body.room !== 'string' || !Number.isInteger(body.version)) {
                    respond(response, 422, { error: 'invalid_payload' });
                    return;
                }

                const events = Array.isArray(body.events) ? body.events.filter((e) => typeof e === 'string') : [];
                const ping = { version: body.version, events };

                io.to(body.room).emit('game:state-updated', ping);
                events.forEach((event) => io.to(body.room).emit(event, { version: body.version }));
                respond(response, 200, { ok: true });
            })
            .catch(() => respond(response, 400, { error: 'invalid_json' }));
    }

    return {
        io,
        server,
        listen: (port) => new Promise((resolve) => server.listen(port, () => resolve(server.address().port))),
        close: () => new Promise((resolve) => io.close(() => resolve())),
    };
}

/**
 * Checks a token issued by App\Services\RealtimeHub::token().
 */
function verifyToken(token, secret, now = Date.now() / 1000) {
    if (typeof token !== 'string' || !token.includes('.')) {
        return null;
    }

    const [payload, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (!secretsMatch(signature, expected)) {
        return null;
    }

    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());

        return claims.exp > now ? claims : null;
    } catch {
        return null;
    }
}

function secretsMatch(given, expected) {
    if (typeof given !== 'string') {
        return false;
    }

    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(expected).digest();

    return crypto.timingSafeEqual(a, b);
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = '';

        request.on('data', (chunk) => {
            body += chunk;

            if (body.length > MAX_BODY_BYTES) {
                request.destroy();
                reject(new Error('too_large'));
            }
        });
        request.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });
        request.on('error', reject);
    });
}

function respond(response, status, body) {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
}

module.exports = { createRelay, verifyToken };
