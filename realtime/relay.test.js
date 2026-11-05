const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { after, before, test } = require('node:test');
const { io } = require('socket.io-client');
const { createRelay, verifyToken } = require('./relay');

const SECRET = 'relay-test-secret';

function tokenFor(room, member, exp = Date.now() / 1000 + 60, secret = SECRET) {
    const payload = Buffer.from(JSON.stringify({ room, member, exp })).toString('base64url');

    return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
}

let relay;
let url;
const presence = [];
const sockets = [];

function connect(token) {
    const socket = io(url, { auth: { token }, reconnection: false, transports: ['websocket'] });
    sockets.push(socket);

    return new Promise((resolve, reject) => {
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });
}

function publish(body, secret = SECRET) {
    return fetch(`${url}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Realtime-Secret': secret },
        body: JSON.stringify(body),
    });
}

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
    relay = createRelay({
        secret: SECRET,
        appUrl: 'http://app.test',
        fetchImpl: async (_url, options) => {
            presence.push({ headers: options.headers, ...JSON.parse(options.body) });
            return { ok: true };
        },
    });
    url = `http://127.0.0.1:${await relay.listen(0)}`;
});

after(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await relay.close();
});

test('verifyToken accepts valid tokens and rejects tampered or expired ones', () => {
    assert.equal(verifyToken(tokenFor('AAA111', 1), SECRET).member, 1);
    assert.equal(verifyToken(tokenFor('AAA111', 1, Date.now() / 1000 - 1), SECRET), null);
    assert.equal(verifyToken(tokenFor('AAA111', 1, undefined, 'wrong-secret'), SECRET), null);
    assert.equal(verifyToken('garbage', SECRET), null);
    assert.equal(verifyToken(undefined, SECRET), null);

    const [payload, signature] = tokenFor('AAA111', 1).split('.');
    const forged = Buffer.from(JSON.stringify({ room: 'OTHER1', member: 1, exp: Date.now() / 1000 + 60 })).toString('base64url');

    assert.equal(verifyToken(`${forged}.${signature}`, SECRET), null);
    assert.ok(payload);
});

test('a connection without a valid token is refused', async () => {
    await assert.rejects(connect('invalid'), /unauthorized/);
    await assert.rejects(connect(tokenFor('AAA111', 9, undefined, 'wrong-secret')), /unauthorized/);
});

test('publishing requires the shared secret', async () => {
    assert.equal((await publish({ room: 'AAA111', version: 1 }, 'wrong')).status, 403);
    assert.equal((await publish({ room: 7, version: 1 })).status, 422);
});

test('pings reach only sockets in that room', async () => {
    const inRoom = await connect(tokenFor('ROOM01', 1));
    const otherRoom = await connect(tokenFor('ROOM02', 2));
    let leaked = false;

    otherRoom.on('game:state-updated', () => {
        leaked = true;
    });

    const received = once(inRoom, 'game:state-updated');
    const named = once(inRoom, 'bet:place');
    assert.equal((await publish({ room: 'ROOM01', version: 5, events: ['bet:place'] })).status, 200);

    assert.deepEqual(await received, { version: 5, events: ['bet:place'] });
    assert.deepEqual(await named, { version: 5 });

    await wait(100);
    assert.equal(leaked, false);
});

test('a client cannot broadcast to its room', async () => {
    const sender = await connect(tokenFor('ROOM03', 1));
    const listener = await connect(tokenFor('ROOM03', 2));
    let received = false;

    listener.on('game:state-updated', () => {
        received = true;
    });
    sender.emit('game:state-updated', { version: 999 });

    await wait(100);
    assert.equal(received, false);
});

test('presence reports first connect and last disconnect only, with the secret', async () => {
    presence.length = 0;

    const firstTab = await connect(tokenFor('ROOM04', 4));
    const secondTab = await connect(tokenFor('ROOM04', 4));
    await wait(50);

    assert.equal(presence.filter((p) => p.member === 4 && p.connected).length, 1);
    assert.equal(presence[0].headers['X-Realtime-Secret'], SECRET);

    firstTab.disconnect();
    await wait(50);
    assert.equal(presence.filter((p) => p.member === 4 && !p.connected).length, 0, 'Another tab is still open.');

    secondTab.disconnect();
    await wait(50);
    assert.equal(presence.filter((p) => p.member === 4 && !p.connected).length, 1);
});

test('health endpoint responds and unknown routes are 404', async () => {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal((await fetch(`${url}/nope`)).status, 404);
});
