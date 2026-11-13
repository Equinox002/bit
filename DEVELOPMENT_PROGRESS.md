# Development Progress

Real-time multiplayer card game built on the existing Laravel + Breeze + React project.
The working name is **Betwixt**, set in one place: `resources/js/game/brand.js`.

## Running it

| Goal | Command | Open |
|---|---|---|
| Develop on this computer | `npm run game` | http://localhost:8000 |
| Play with friends on the same network | `npm run game:lan` | `http://<this computer's IP>:8000` |
| Share one device, with no internet | Any of the above once, then | `/pass-and-play` |

MySQL must be running in XAMPP. Stop any other Vite or `php artisan serve` terminals first.

On a network game, the host must open the site using the computer's IP address, not `localhost`,
because invite links are built from the address in the browser. Windows may also ask to allow
PHP and Node through its firewall (ports 8000 and 6001).

`php artisan serve` also works, but is about 14 times slower per request because it runs without
OPcache. `scripts/serve.cjs` turns OPcache on for this project only.

## Admin panel

Open `/admin`. To give an account access, or create a new admin account:

```
php artisan admin:make you@example.com
php artisan admin:make you@example.com --revoke
```

Anyone who isn't logged in is sent to the login page. Every other account, and all guests, get a
plain 404. `is_admin` can only be set by this command, never through a form. The panel is read-only.

Each page view is logged in `visits` with the IP address, account, page, browser, operating system,
device type, language, referring site, status and response time. Left out on purpose:

- Background requests, redirects, form submissions and the panel's own pages.
- Query strings, internal referrers and password reset or email verification tokens.
- Location. Looking up a country would mean sending visitors' IPs to an outside service or adding a
  location database, and addresses on a home network have no location anyway.

Visits older than `VISIT_RETENTION_DAYS` (90) are deleted by `php artisan model:prune --model="App\Models\Visit"`.
It is scheduled daily, but nothing runs Laravel's scheduler on this setup, so run it by hand or add a
scheduled task. `ADMIN_TIMEZONE` sets which calendar day visits count toward.

A front server on this computer can report a visitor's real IP with `X-Forwarded-For`, and only
`127.0.0.1` and `::1` are trusted to do so. Such a server must replace that header rather than pass
on what the visitor sent.

## Status

| Phase | Status |
|---|---|
| 1. Analysis and planning | Done |
| 2. Game engine | Done |
| 3. Room and lobby | Done |
| 4. Real-time multiplayer | Done |
| 5. UI/UX | Done |
| 6. Advanced rules | Done |
| 7. Testing and optimization | Done, apart from the checks listed under Pending |
| Offline pass-and-play (added after the original plan) | Done |

## Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Laravel 12, React (JSX), Inertia | Existing project; upgraded from 10 because Laravel 10 and 11 have unpatched advisories. `composer.json` requires 12.69 or later, the first release with every known advisory fixed. The Laravel 10 folder layout is kept, which Laravel supports |
| PHP | 8.2 or later | Laravel 12 requires it. XAMPP's PHP 8.1 can no longer run this project |
| Real-time | Socket.IO relay in `realtime/` (Node) | Reverb needs PHP 8.2+. The relay holds no game logic |
| Commands | HTTP POST with idempotency key | Reuses session auth, CSRF, rate limiting and validation |
| Updates | Socket sends a version number, client fetches its own filtered state | One authorization path; hidden information can't leak through broadcasts |
| Authority | `app/Game` engine run inside a DB transaction holding a row lock on the room | Actions in a room run one at a time |
| Money | Whole chips; multiplier stored in hundredths | No floating-point errors |
| Identity | Name-only guest users; login optional | Owner's choice. Guests get a placeholder email, so `users` columns stay unchanged |
| Cache/presence | MySQL, no Redis | Sufficient at this scale |
| Timers | Server stores deadlines; any client's heartbeat can trigger enforcement | No queue worker to run. If everyone leaves, the game simply waits |
| Seat sizes | `useSeatLayout` measures the table and switches to compact seats when regular ones would collide | Depends on screen, player count and panel height |
| Offline rules | A JavaScript copy of the engine in `resources/js/game/engine/` | No server is reachable offline. Online games never use it |
| Keeping both engines equal | Recorded PHP games replay through JavaScript, comparing a checksum at every step | A rule changed on only one side fails the tests |
| Chips | Drawn as inline SVG from `resources/js/game/chips.js`, in real denominations | No image assets to load offline. Purely decorative: the exact amount is always shown as text |
| Table animation | Only opacity and transform animate continuously; the felt has its own layer | Animating shadows repainted the whole table every frame, which is hard on phone batteries |
| Offline loading | Service worker in `public/sw.js` stores only `/pass-and-play` and built assets | Online game requests must never be answered from a cache |
| Offline saves | Browser `localStorage` | Nothing leaves the device. A player could read the deck there, which is acceptable for friends sharing a device |
| Offline timers | No betting countdown; the reveal pause is the only timer | Nobody should race a clock while passing a device around |

## Code map

| Area | Location |
|---|---|
| Rules engine (no framework dependencies) | `app/Game/` |
| Transactions, locking, presence, host handover | `app/Services/GameService.php` |
| Rooms and joining | `app/Services/RoomService.php` |
| History tables and statistics | `app/Services/GameRecorder.php` |
| What each browser may see | `app/Game/StateView.php`, `app/Services/RoomPresenter.php` |
| Socket.IO relay | `realtime/relay.js` |
| Client sync | `resources/js/game/useGameRoom.js` |
| Screens | `resources/js/Pages/`, `resources/js/Components/Game/` |
| Poker chips and bets on the felt | `Components/Game/PokerChip.jsx`, `Components/Game/TableChips.jsx`, `resources/js/game/useSeatLayout.js` |
| Offline game | `resources/js/Pages/PassAndPlay.jsx`, `resources/js/game/useLocalGame.js` |
| Admin screens | `app/Http/Controllers/Admin/`, `resources/js/Pages/Admin/`, `resources/js/Components/Admin/`, `resources/js/Layouts/AdminLayout.jsx` |
| Visit log | `app/Http/Middleware/RecordVisit.php`, `app/Services/VisitRecorder.php`, `app/Services/UserAgentParser.php` |

**After an intentional rule change in `app/Game`:** make the same change in
`resources/js/game/engine/`, then run `php tests/Support/generate-engine-fixture.php` and
`npm run test:engine`. The PHP test fails until the recordings are regenerated, and the JavaScript
test fails until the two engines agree again.

## Rule decisions

Confirmed by the owner:

- All hands are face up by default; the host can hide them per room.
- Anything left in the pot carries into the next round, and each player adds the contribution on
  top: 40 left with three players adding 10 starts the next round at 70. Anyone who can't pay sits
  out that round, and the game ends if too few can pay. The `contributeEveryRound` setting (on by
  default) limits contributions to an empty pot when turned off. Immediate narrow-range re-deals
  are the same round, so they don't charge anything.
- A round ends once every player has had a turn, even with chips left in the pot, and new cards are
  dealt. `maxCycles` defaults to 1; 0 keeps the same cards until a reset.
- Friends join with a display name; login is optional.

Defaults chosen to resolve gaps or conflicts in the spec. The owner has seen these and can overrule them:

1. Pot = contributions + optional seed. The seed is recorded in the ledger and defaults to 0.
2. Declining is always possible, because "never forced" overrides an "allow declining: off" setting.
   There is therefore no "allow declining" setting.
3. "Allow skipping: off" means an active player who passes ends the turn without inviting anyone.
4. "End betting when pot is exhausted: off" logs remaining players as auto-passed. They can't bet,
   because an unfunded bet would break the pot rule.
5. The minimum bet drops to the available amount when less is left, so a small pot can't stall play.
6. Narrow-range re-deals are capped at 5 per round and don't charge a new contribution.
7. A reset during a turn that has bets finishes that turn first; with no bets it resets immediately.
8. A hand with no winning range skips its turn, or is replaced if the room is configured that way.
9. A turn with no bets draws no card.
10. The game ends when the host ends it or fewer than the minimum number of players have chips.
    Any leftover pot is split equally among seated players; an indivisible remainder stays in the pot.
11. The UI shows chips rather than the rupee symbol, because this is virtual currency only.
12. A player who exits mid-game can't rejoin that game. Closing the page and reopening the link
    keeps the seat.
13. Tables seat at most 12, leaving enough cards to draw from.
14. In pass-and-play, a pass screen always appears between players when cards are hidden, and is
    optional when they are face up. Reopening a saved game always asks again.
15. Pass-and-play games don't count toward online statistics or recent games.
16. If a full cycle passes with no bets, the round ends and new cards are dealt. No card is drawn on
    a turn without bets, so otherwise the same hands would repeat forever. On by default; the room
    setting is `resetOnIdleCycle`, which matters when `maxCycles` allows more than one cycle. Raised
    by the owner.
17. The Quick preset no longer sets its own cycle limit. Two cycles would make it slower than Classic.

## Pending

- [x] Security: moved off Laravel 10 to Laravel 12. `composer audit` reports no advisories.
      Registration and profile emails still reject line breaks, as an extra guard against CRLF.
- [ ] Security: `npm audit` reports issues including a high-severity one in Vite 4. The fix is a
      major upgrade, so it is not applied. It affects the development toolchain.
- [ ] Try it on real phones on a real network. Automated tests ran in separate browser sessions on
      one computer.
- [ ] **Offline on phones needs HTTPS.** Browsers only allow service workers on HTTPS or `localhost`.
      A phone using `http://192.168.x.x` can play pass-and-play while the page stays open, but
      can't reopen it with no connection. Installing to the home screen also needs HTTPS.
- [ ] Only tested in Chromium. Pass-and-play in particular should be tried in Safari on an iPhone.
- [ ] Hosting. Internet play needs a host that can run PHP, MySQL and a long-lived Node process, plus
      HTTPS on both the site and the relay.
- [ ] **Unexplained stall, seen once.** In one browser-test run, all requests to the game server
      went from about 300ms to 10-14 seconds for at least 15 seconds, leaving the browsers on the
      old screen. The server had advanced the game on time. It did not recur in 5 repeat games with
      a probe watching the servers and MySQL (one 2.1s blip), so the cause is unknown. That run had
      full trace recording on, which is heavy. `php -S` handles one request at a time, so any slow
      request delays everyone; for regular play, consider Apache with OPcache.
- [ ] Twelve seats on a phone narrower than 360px has not been checked.
- [ ] **Before going public: tell visitors IP addresses are logged.** The visit log holds personal
      data, which privacy laws may require a notice for. Put HTTPS in front of `/admin` as well.
- [ ] Other devices took about a minute to download the 286 KB main script from `php -S` on one
      network, while the 54 KB stylesheet took about a second. The cause isn't confirmed, and a small
      trial front server that sends built files itself has not yet been tested from a second device.

## Test results

Last full run: 2026-11-04.

| Suite | Command | Result |
|---|---|---|
| Engine, backend and admin panel (PHPUnit) | `php artisan test` | 204 passed |
| Socket.IO relay | `npm run test:relay` | 7 passed |
| JavaScript engine, including recorded PHP games, and chip stacks | `npm run test:engine` | 19 passed |
| Browser, on MySQL with live sockets, using the production build | `npm run test:e2e` | 21 passed |

The browser tests use their own `card_e2e` database and never touch development data. They set
`VITE_HOT_FILE` so they use the production build even while a Vite dev server is running.

### Required test coverage

| # | Requirement | Where |
|---|---|---|
| 1-3 | Deck, no duplicates, shuffling | `tests/Unit/Game/CardsTest.php` |
| 4-8 | Dealing, ace, ranges, consecutive and identical cards | `CardsTest`, `BettingTest` |
| 9-10 | Active player, clockwise rotation | `RoundLifecycleTest` |
| 11-15 | Self-betting, participation, declining, limits, pot exhaustion | `BettingTest` |
| 16-19 | 2x payout, losing bets, multiple winners and losers | `BettingTest` |
| 20-22 | Narrow reset, multiple cycles, deck exhaustion | `RoundLifecycleTest` |
| 23-25 | Disconnection, reconnection, host disconnection | `tests/Feature/Game/GamePlayTest.php`, `tests/e2e/game.spec.js` |
| 26-27 | Duplicate bets and settlements | `BettingTest`, `GamePlayTest`, `game.spec.js` |
| 28-29 | Pot never negative, ledger consistency | `tests/Unit/Game/LedgerTest.php` (300 random games), `GamePlayTest` |
| 30 | Simultaneous actions | `game.spec.js` (two PHP servers, one database) |
| - | Three browser sessions | `game.spec.js` |

### Bugs found by testing

- **Infinite loop:** a table where nobody could ever bet passed between empty turns forever. Fixed
  with a `no_eligible_bettors` reset. Caught by the random-game simulation.
- **Frozen game:** a player's first-ever bet losing crashed settlement, because `max(null, 0)` is
  `null` in PHP. Fixed. Only appeared on some random deals.
- **Duplicate cards:** a player who left kept their hand after a new deal. Fixed before testing.
- **Stolen focus:** dialogs took keyboard focus on every live update. Fixed.
- **Slow requests:** about 0.3s each without OPcache, about 0.02s with it. Fixed in `scripts/serve.cjs`.
- **Dead button:** the round summary's close button did nothing. Removed, since it closes itself.
- **No request timeout:** a request lost on a flaky network could leave a player stuck. Requests now
  time out and retry, reusing the same key so a bet can't apply twice.
- **Relay outage lag:** with the relay down, each action waited about a second for it. Publishing
  now pauses for 10 seconds after a failure.
- **Repeat downloads:** an `async` callback inside `.filter()` made the service worker re-download
  every asset on every visit. Fixed.
- **Skipped pass screen:** reopening a hidden-cards game showed that player's hand with no pass
  screen. Fixed, and tested.
- **Stuck test helper:** with rounds ending more often, a click on Deal Next Round could wait forever
  after another browser had already dealt. Seat checks also compared measurements from different
  moments of a live game. Both fixed in `tests/e2e/helpers.js`.
- **Constant repainting:** the pulsing turn glow repainted the table on every frame. Idle browser
  load fell from 7-17% to 4-6% after changing it to animate opacity only.
- **Sideways phones:** the betting panel left the table 84px tall, with a seat on top of the cards.
  On short screens the panel now sits beside the table. Seats also took their size from the screen
  while the layout measured the table, which clipped them there; they now follow the table.
- **Chips on the cards:** clearing the pot could push a bet onto the cards. Bets now always slide
  outwards from the table's centre, and the tests check the pot, cards and rank ladder stay clear.
- **Frozen test runner:** recording video from twelve browsers of a never-ending glow froze the test
  runner (a 476 MB trace). Traces now keep page snapshots without video.
- **Overlapping seats:** twelve players overlapped on a small phone, and seats clipped on short
  desktop windows. Found by reading screenshots. Fixed, and the tests now check for it.
