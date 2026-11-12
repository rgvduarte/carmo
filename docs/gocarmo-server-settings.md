# GOCARMO Ride: what the fork changes in the server

GOCARMO Ride is a modified version of OpenRadlr. This page lists what the
fork's server does differently from upstream's, every setting it adds, and
measured values to choose them by. Everything else is as in
[deploy.md](deploy.md). Internal names are upstream's: settings start with
`OPENRADLR_`, the binary is `openradlr-server`, cookies and metrics start with
`openradlr_`.

## New and changed settings

An unset variable keeps upstream's behaviour, except where the last column
says otherwise.

| Setting | Default | What it does | Risk |
| --- | --- | --- | --- |
| `OPENRADLR_FRAME_ANCESTORS` | empty | Origins, separated by commas, that may show the game in an `<iframe>`. The policy then says `frame-ancestors <list>` and `X-Frame-Options` is left out. Empty: `frame-ancestors 'none'` and `X-Frame-Options: DENY`, as upstream. | A listed site can put the game in a frame and draw over it (clickjacking). List only sites you run. |
| `OPENRADLR_ALLOWED_ORIGINS` | empty | Upstream: pages that may open game connections. New: pages on these origins may also read `/api/info`, `/api/route`, `/api/map` and `/api/studio` from another origin (CORS: exact match, no credentials, `Vary: Origin`, preflights answered). Empty: any page may open game connections and no CORS header is sent, as upstream. | The four routes are public anyway. A page on a listed origin can also open game connections. |
| `OPENRADLR_CLIENT_IP_HEADER` | empty | Name of the header in which the hosting platform's proxy reports the client's address, one address per request (Fly.io: `Fly-Client-IP`). When it holds exactly one valid address, the per-IP connection limit counts by it and ignores `X-Forwarded-For`. Absent, repeated, a list or not an address: as without the setting. | **Set it only when the server can be reached through that proxy and no other way.** Reached directly, anyone can send the header and dodge the limit. |
| `OPENRADLR_SEND_BUFFER_BYTES` | empty (the system decides) | Kernel send buffer of every client connection, 4096 to 16777216. A client that stops reading then holds this much kernel memory (Linux accounts about twice the value) instead of up to 4 MB, and is closed sooner. | Too small slows the first page load on slow, distant links. 131072 was used in the tests below. |
| `OPENRADLR_METRICS_TOKEN` | empty | `/internal/metrics` answers only requests with `Authorization: Bearer <token>` (at least 16 characters, no spaces). | Changed default, see "Metrics". Keep the token out of the repository. |
| `OPENRADLR_OBN_APP_ID` | none | The app id the server says `hello` with to an OpenBikeNet server. Needed with `OPENRADLR_OBN_URL`; there is no default. | See "Identity". |
| `OPENRADLR_SERVER_NAME` | `GOCARMO Ride` (was `OpenRadlr`) | Unchanged otherwise. | |

`docker-compose.yml` hands the container a fixed list of variables. The new
ones are not in it yet, its `OPENRADLR_ALLOWED_ORIGINS` is the public URL
alone, and its default for `OPENRADLR_SERVER_NAME` is still `OpenRadlr`, which
overrides the server's own default. On a platform that sets variables on the
container directly none of this matters; for Docker Compose the file has to be
extended first.

Both origin lists are checked at start-up. An entry must be
`scheme://host[:port]`: no path, no wildcard, no spaces, nothing else. A
malformed entry stops the server with a message that names the variable. This
also holds for `OPENRADLR_ALLOWED_ORIGINS`, where upstream accepted anything
(a wrong entry there never matched).

### Behaviour that changed without a setting

- **Clients that stop reading** are closed after 20 s without progress and can
  no longer fill the server's memory. See "Stalled clients".
- **`/internal/metrics`** is no longer open to everyone. See "Metrics".
- **Strava**: a login whose tokens Strava refuses answers `not_connected`
  instead of "try again". See "Strava".
- **Identity**: the server no longer calls itself OpenRadlr to Strava or to an
  OpenBikeNet server. See "Identity".

## The game inside a page of gocarmo.com

The game is served whole by the game server on `https://ride.gocarmo.com`;
`https://gocarmo.com/ride/` shows it in an `<iframe>` and reads `/api/info`
for a status line. For that:

```bash
OPENRADLR_PUBLIC_URL=https://ride.gocarmo.com
OPENRADLR_FRAME_ANCESTORS=https://gocarmo.com,https://www.gocarmo.com
OPENRADLR_ALLOWED_ORIGINS=https://ride.gocarmo.com,https://gocarmo.com,https://www.gocarmo.com
```

`OPENRADLR_ALLOWED_ORIGINS` needs the game's own origin too: inside the frame
the game connection still comes from `https://ride.gocarmo.com`.

Cookies: the Strava session cookie is `HttpOnly; SameSite=Lax; Secure` (with an
`https` public URL), as upstream. `SameSite=Lax` is enough for the frame:
`gocarmo.com` and `ride.gocarmo.com` are the same site, so the browser sends the
cookie with the frame's requests. `SameSite=None` would only be needed for a
frame on another domain, and is not wanted. Strava's own pages refuse to be
framed, so "Connect with Strava" has to leave the frame (the top window or a
new tab); that is the client's part.

## Behind a hosting platform's proxy

Upstream's `OPENRADLR_TRUST_PROXY=true` takes the last `X-Forwarded-For`
address. Behind one reverse proxy of your own (Caddy, nginx) that is the
client. Behind a platform's proxy it is the platform's proxy itself, so every
rider would share the four connections of one address. Set
`OPENRADLR_CLIENT_IP_HEADER` to the header the platform documents and leave
`OPENRADLR_TRUST_PROXY` off:

| Host | Header | Checked here |
| --- | --- | --- |
| Fly.io | `Fly-Client-IP` | the header name comes from the earlier review of Fly's proxy; not tested against Fly |
| a host behind Cloudflare | `CF-Connecting-IP` | not tested; confirm in the host's documentation |
| your own Caddy or nginx on a VPS | none: use `OPENRADLR_TRUST_PROXY=true` | upstream's behaviour |

The per-IP limit (`OPENRADLR_MAX_CONNECTIONS_PER_IP`, default 4) counts one
IPv6 address, not a network, and mobile operators put many customers behind
one IPv4 address. For a public pilot 8 is a safer value than 4.

## Stalled clients

A rider's connection has a queue of 256 outgoing messages. Upstream put every
state snapshot in it (about 45 kB each in memory on a full route), so a client
that joined and then read nothing held up to 11 MB, and the idle and handshake
timeouts could not close it: their last message waited for room in that queue.

Now a state snapshot only holds a place in the queue. The snapshot itself lies
in one slot that every newer snapshot overwrites. A client that keeps up gets
every message in the order sent, exactly as before. A slow one gets every
one-off message (events, chat, errors) and the newest state, not a backlog of
old ones. A write that makes no progress for 20 s closes the connection; the
rider is detached like after any dropped connection and can come back within
`OPENRADLR_GRACE_S`.

Measured with 70 riders (50 trainer, 20 phone) that join one route and stop
reading while they keep sending, plus one healthy rider on the same route
(`OPENRADLR_MAX_PLAYERS=51`, defaults otherwise, release builds, loopback):

| | upstream 2b09a79 | fork | fork, `OPENRADLR_SEND_BUFFER_BYTES=131072` |
| --- | --- | --- | --- |
| Server memory (RSS) before | 9.9 MB | 9.7 MB | 9.7 MB |
| Peak RSS | 798.7 MB | 46.2 MB | 46.2 MB |
| Stalled connections open after 150 s | 70 of 70 | 0 (all closed between 40 and 45 s) | 0 (all closed between 21 and 25 s) |
| Kernel TCP memory at its peak (whole machine) | 281 MB, held until the clients closed | 281 MB for about 20 s | 20 MB |
| States per second to the healthy rider | 4.0 | 4.0 | 4.0 |

Without the buffer setting the kernel first fills up to 4 MB per stalled
connection (about 22 s on a full route), then the 20 s start. That kernel
memory counts against a container's limit on most hosts, which is why the
pilot values below set the buffer.

## Metrics

Upstream answered `/internal/metrics` to anyone. The fork answers:

- with `OPENRADLR_METRICS_TOKEN`: requests with `Authorization: Bearer <token>`,
  from anywhere; everything else gets `401`;
- without it: only this machine itself, that is a loopback peer whose request
  carries no `X-Forwarded-For`, `Forwarded`, `X-Real-IP` or the configured
  client address header (a reverse proxy on the same machine is a loopback
  peer too). Everyone else gets `404`.

Upstream's monitoring stack scrapes the endpoint from another container over
the private `openradlr-metrics` Docker network. That is not a loopback peer, so
it now needs the token: pass `OPENRADLR_METRICS_TOKEN` to the server (the
compose file does not pass it yet) and give it to Prometheus:

```yaml
scrape_configs:
  - job_name: openradlr
    metrics_path: /internal/metrics
    authorization:
      credentials_file: /run/secrets/openradlr_metrics_token
    static_configs:
      - targets: ["openradlr-server:8080"]
```

On the server itself `curl http://127.0.0.1:8080/internal/metrics` keeps working
without a token.

## Identity

A modified fork must not present itself as OpenRadlr.

- Requests to Strava carry `User-Agent: GOCARMO-Ride/<version>
  (+https://gocarmo.com/ride/)`.
- An uploaded activity's description is `GOCARMO Ride: <public URL>`; its name
  is what the client sends, or `GOCARMO Ride`; the uploaded file is called
  `gocarmo-ride.fit`; the `external_id` starts with `gocarmo-ride-`.
- The default server name is `GOCARMO Ride`.
- OpenBikeNet: the `hello` carries the name `GOCARMO Ride` and the page
  `https://gocarmo.com/ride/`. The app id is `OPENRADLR_OBN_APP_ID`. Upstream
  sent `openradlr`, which is not this fork's to use, and no id was agreed with
  any OpenBikeNet operator, so there is no default: `OPENRADLR_OBN_URL` without
  an id stops the server at start-up. The link stays off unless both are set.
  Before turning it on, ask the operator of the OpenBikeNet server which id to
  use.

Not changed, on purpose: the `openradlr://` address the native app's Strava
sign-in ends on (the fork ships no native app), the cookie and metric names,
the database file. Not the server's: the browser client still sends the app id
`openradlr` to OpenBikeControl controllers
(`client/public/js/ble/openBikeControl.js`).

## Strava

What upstream offers stays: "Connect with Strava" through the server, upload
of the FIT file as a virtual ride with positions that draw a map, and `.fit`,
`.tcx` and `.gpx` downloads. Facts to tell riders plainly:

- Strava's public API cannot attach a photo to an activity. The summary image
  is saved or shared by the rider and added in Strava by hand.
- A new Strava API application is limited to one athlete until Strava approves
  more. Until then everybody else downloads the `.fit` file and uploads it on
  strava.com by hand.
- Rides on the simulated trainer or the phone paddles are not uploaded.

### Logins without a disk

Where logins live (tested in `server/crates/server/tests/strava_flow.rs`):

| `OPENRADLR_DATA_DIR` | `OPENRADLR_SECRET_KEY` | Logins |
| --- | --- | --- |
| unset | unset or set | in memory; gone when the server restarts |
| set | unset | in memory; gone when the server restarts |
| set, writable | set | in SQLite in that directory, refresh tokens encrypted; they survive a restart for as long as the directory does |
| set, not writable | set | the server does not start |

The Docker image sets `OPENRADLR_DATA_DIR=/app/data`. On a host without a
volume that directory lives as long as the container: with the key, logins
survive a restart of the process but not a new container (a deploy, or a free
host waking from sleep). Without the key they are in memory. Either way a
rider who connected earlier presses "Connect" again; Strava skips its consent
page the second time.

A rider whose login is gone when they press "Upload" gets `401` with
`{"code":"not_connected"}` from `/api/me`, `/api/strava/upload` and
`/api/strava/upload/{id}`, never a `500`. The client keeps the finished ride in
the page, shows "connect" next to it and uploads after the rider is back. The
fork adds the same answer for a login that Strava itself refuses (the rider
removed the app in their Strava settings, or a restored login is stale):
upstream answered "could not reach Strava, try again" for ever. Strava being
down or busy still answers `502` and keeps the login.

### Stateless sessions: looked at, not built

The idea: seal the refresh token with `OPENRADLR_SECRET_KEY` inside the cookie,
so no disk is needed and a restart logs nobody out. It was not built, because
in this code it is neither small nor fully testable:

- The session id is today a random value that means nothing outside the
  server. A sealed token in the cookie turns a copied cookie into a login that
  the server cannot end: "log out" would only clear the cookie in that one
  browser, until the 30 days are over or the key changes for everyone.
- Strava may answer a refresh with a new refresh token. The server would have
  to send a new cookie with the answer of an upload, and a second browser of
  the same rider would keep a sealed token that Strava no longer accepts.
- It touches how sessions are found, logged out, refreshed and handed to the
  native app's sign-in, for a gain of one press on "Connect" per rider after
  a restart, on a pilot where Strava allows one athlete anyway.

The trade-off as it stands: without a disk, a restart costs each connected
rider one press on "Connect"; no ride is lost. A host with a small volume and
`OPENRADLR_SECRET_KEY` removes even that.

Tokens are never logged; log lines carry Strava's HTTP status only.

## Capacity and traffic

Measured on the fork's release binary (commit of this page), one process, on an
Intel Xeon at 2.1 GHz (4 cores; the server uses a fraction of one). Riders are
scripted clients on one route (`rolling-hills`, all bundled routes loaded,
spin studio on) that send power four times a second and read everything. CPU
is the share of one core over 20 s; traffic is the JSON the server sends to
one rider, without TLS and TCP overhead (add about 5 %). "Idle" is the server
with bots only. A shared or throttled core of a small host is slower than this
one: read the CPU column as a ratio between settings, and keep a margin.

**CPU, % of one core, by riders on the route**

| Settings (`OPENRADLR_` left out) | idle | 5 | 10 | 20 | 30 | 50 |
|---|---|---|---|---|---|---|
| upstream binary, defaults | 1.2 | 1.5 | 2.1 | 3.2 | 4.8 | 6.9 |
| defaults (200 visible, 12 bots per route, 4 Hz) | 1.1 | 1.5 | 2.1 | 3.3 | 4.8 | 7.2 |
| `MAX_VISIBLE_RIDERS=30` | 1.1 | 1.4 | 1.9 | 2.5 | 3.5 | 5.6 |
| `MAX_VISIBLE_RIDERS=15` | 1.1 | 1.4 | 1.8 | 2.5 | 3.5 | 5.5 |
| `TARGET_RIDERS=4` | 0.4 | 0.8 | 1.1 | 1.8 | 2.7 | 5.4 |
| `MAX_VISIBLE_RIDERS=30` `TARGET_RIDERS=4` | 0.4 | 0.9 | 1.1 | 1.7 | 2.5 | 4.6 |
| `BROADCAST_HZ=2` | 0.9 | 1.4 | 1.9 | 2.5 | 3.4 | 4.8 |
| `MAX_VISIBLE_RIDERS=30` `BROADCAST_HZ=2` | 0.9 | 1.4 | 1.6 | 2.2 | 2.9 | 4.0 |
| `MAX_VISIBLE_RIDERS=20` `TARGET_RIDERS=6` `BROADCAST_HZ=2` | 0.5 | 0.9 | 1.6 | 2.2 | 2.8 | 4.8 |
| `MAX_VISIBLE_RIDERS=15` `TARGET_RIDERS=4` `BROADCAST_HZ=2` | 0.4 | 0.8 | 1.6 | 2.1 | 2.8 | 4.5 |

**Memory (RSS), MiB**

| Settings (`OPENRADLR_` left out) | idle | 5 | 10 | 20 | 30 | 50 |
|---|---|---|---|---|---|---|
| upstream binary, defaults | 9 | 11 | 13 | 16 | 20 | 26 |
| defaults (200 visible, 12 bots per route, 4 Hz) | 9 | 11 | 13 | 17 | 20 | 28 |
| `MAX_VISIBLE_RIDERS=30` | 9 | 10 | 12 | 14 | 16 | 20 |
| `MAX_VISIBLE_RIDERS=15` | 9 | 10 | 12 | 14 | 16 | 19 |
| `TARGET_RIDERS=4` | 9 | 10 | 12 | 15 | 17 | 24 |
| `MAX_VISIBLE_RIDERS=30` `TARGET_RIDERS=4` | 9 | 10 | 12 | 14 | 16 | 20 |
| `BROADCAST_HZ=2` | 9 | 11 | 13 | 17 | 20 | 25 |
| `MAX_VISIBLE_RIDERS=30` `BROADCAST_HZ=2` | 9 | 11 | 12 | 14 | 16 | 20 |
| `MAX_VISIBLE_RIDERS=20` `TARGET_RIDERS=6` `BROADCAST_HZ=2` | 9 | 10 | 12 | 13 | 15 | 18 |
| `MAX_VISIBLE_RIDERS=15` `TARGET_RIDERS=4` `BROADCAST_HZ=2` | 9 | 10 | 11 | 13 | 15 | 18 |

**Traffic to each rider, kB/s (MB per rider-hour in brackets)**

| Settings (`OPENRADLR_` left out) | 5 | 10 | 20 | 30 | 50 |
|---|---|---|---|---|---|
| upstream binary, defaults | 89.3 (322) | 88.6 (319) | 95.3 (343) | 106.5 (384) | 122.4 (441) |
| defaults (200 visible, 12 bots per route, 4 Hz) | 89.3 (321) | 88.6 (319) | 95.6 (344) | 105.4 (380) | 122.4 (441) |
| `MAX_VISIBLE_RIDERS=30` | 31.7 (114) | 30.8 (111) | 29.3 (105) | 27.7 (100) | 27.7 (100) |
| `MAX_VISIBLE_RIDERS=15` | 15.5 (56) | 14.9 (54) | 13.9 (50) | 14.1 (51) | 14.1 (51) |
| `TARGET_RIDERS=4` | 30.5 (110) | 35.1 (126) | 44.1 (159) | 53.1 (191) | 71.4 (257) |
| `MAX_VISIBLE_RIDERS=30` `TARGET_RIDERS=4` | 30.7 (111) | 30.9 (111) | 29.2 (105) | 27.6 (99) | 27.7 (100) |
| `BROADCAST_HZ=2` | 44.8 (161) | 44.4 (160) | 47.7 (172) | 52.2 (188) | 61.3 (221) |
| `MAX_VISIBLE_RIDERS=30` `BROADCAST_HZ=2` | 15.9 (57) | 15.5 (56) | 14.7 (53) | 13.9 (50) | 13.9 (50) |
| `MAX_VISIBLE_RIDERS=20` `TARGET_RIDERS=6` `BROADCAST_HZ=2` | 10.5 (38) | 10.1 (36) | 9.3 (34) | 9.4 (34) | 9.4 (34) |
| `MAX_VISIBLE_RIDERS=15` `TARGET_RIDERS=4` `BROADCAST_HZ=2` | 7.9 (28) | 7.5 (27) | 7.1 (25) | 7.1 (25) | 7.1 (26) |

The first two rows are the same test on upstream's binary and on the fork's.
Four more runs with 50 riders, one after the other: upstream 10.0 and 9.9 %,
fork 10.0 and 8.9 %. The same setting measured in different sessions on this
machine differed by up to half in CPU (50 riders at the defaults: 6.9 to
10.3 %), so compare rows within one table, not across tables.

What the settings do:

- `OPENRADLR_MAX_VISIBLE_RIDERS` caps the riders in one state message, humans
  first, then the nearest bots. It is the main traffic setting: each rider in a
  state costs about 260 bytes, four times a second. The default of 200 sends a
  rider every bot of the world.
- `OPENRADLR_TARGET_RIDERS` is the number of riders each route is filled up to
  with bots. Fewer bots cut the idle CPU (1.1 % to 0.4 % from 12 to 4) and, as
  long as the visible cap is not reached, the traffic.
- `OPENRADLR_BROADCAST_HZ` is how often states are sent (default 4, at most
  `OPENRADLR_TICK_HZ`). 2 halves the traffic.
- CPU grows faster than the number of riders on one route, because every
  rider's state is built from everybody else. The fork's binary costs the same
  as upstream's within what this measurement can tell apart.

### Is 2 Hz still smooth?

The client moves every rider on from its last state with the rider's speed,
for up to 0.6 s, and blends corrections in. Replaying 20 s of real states
through that code at 60 frames per second gives, for the change of a rider's
speed on screen from one frame to the next: 0.010 m/s at 4 Hz, 0.012 to
0.017 m/s at 2 Hz, and 0.72 to 0.76 m/s at 1 Hz. At 1 Hz riders stop and catch
up once a second; at 2 Hz the movement is as even as at 4 Hz.

In a real browser (Chromium with software rendering, the fork's client, the
simulated trainer) rides at 4, 2 and 1 Hz ran without a console error, covered
the same distance and showed the same speed. At 2 Hz the riders ahead and
their name labels kept their places from frame to frame as at 4 Hz. Software
rendering reached 5.6 frames per second with riders in view, too few to tell 4
from 2 Hz by eye or by measuring the labels (median movement per frame 1.8 px
at 4 Hz and 0.7 px at 2 Hz), so that 2 Hz is smooth rests on the replay. One
look on a real graphics card before the pilot opens is still owed. Do not go
below 2.

### WebSocket compression

Not available as a switch. The WebSocket library in `Cargo.lock`
(tungstenite 0.29 under axum 0.8.9, and 0.30 for the OpenBikeNet link) has no
permessage-deflate: axum never answers `Sec-WebSocket-Extensions`. It would
need another library or a rewrite of the connection code, so it was not done.
Deflating real state messages one by one brings them to 14 % of their size at the
defaults (22.4 kB to 3.2 kB) and to 20 % with the pilot values (5.4 kB to
1.1 kB), at the price of CPU for every message. The settings above reach the traffic target without it.

### The first page load

A first visit fetches 203 files, 0.91 MB over the wire with Brotli (measured
in Chromium). The server compresses them on each request (about 0.15 s of CPU
per first visit in the earlier review; not measured again); later visits
revalidate and get `304`.

## Three sets of values

Common to all three (the game on its own host, shown by gocarmo.com):

```bash
OPENRADLR_PUBLIC_URL=https://ride.gocarmo.com
OPENRADLR_FRAME_ANCESTORS=https://gocarmo.com,https://www.gocarmo.com
OPENRADLR_ALLOWED_ORIGINS=https://ride.gocarmo.com,https://gocarmo.com,https://www.gocarmo.com
OPENRADLR_SEND_BUFFER_BYTES=131072
OPENRADLR_MAX_CONNECTIONS_PER_IP=8
# OPENRADLR_STRAVA_CLIENT_ID and OPENRADLR_STRAVA_CLIENT_SECRET: as secrets on the host, never in a file here.
```

### Free pilot (about 0.1 core, 256 to 512 MB, no disk, metered traffic)

```bash
OPENRADLR_MAX_PLAYERS=30
OPENRADLR_MAX_PADDLE_PLAYERS=10
OPENRADLR_MAX_VISIBLE_RIDERS=20
OPENRADLR_TARGET_RIDERS=6
OPENRADLR_BROADCAST_HZ=2
OPENRADLR_CLIENT_IP_HEADER=<the platform's header>
OPENRADLR_TRUST_PROXY=false
# No OPENRADLR_SECRET_KEY needed: without a disk, Strava logins are in memory.
```

Measured with exactly these values: 2.5 % of one core with 20 riders on one
route (3.1 % with 30, 0.9 % idle), 15 MiB of memory with 30 riders, and 9 to
11 kB/s to each rider, which is 34 to 38 MB per rider-hour. A full house of 30
trainer riders is 2.3 Mbit/s, about 1 GB an hour; 100 GB of traffic a month
are about 2,800 rider-hours. Each first visit adds 0.9 MB.

A rider sees at most 20 others, humans first. To send even less:
`OPENRADLR_MAX_VISIBLE_RIDERS=15` with `OPENRADLR_TARGET_RIDERS=4` measured 25
to 28 MB per rider-hour. To keep 4 Hz instead: `OPENRADLR_BROADCAST_HZ=4` with
`OPENRADLR_MAX_VISIBLE_RIDERS=15` measured 50 to 56 MB per rider-hour.

### Fly small (shared-cpu-1x, 256 MB)

```bash
OPENRADLR_MAX_PLAYERS=30
OPENRADLR_MAX_PADDLE_PLAYERS=10
OPENRADLR_MAX_VISIBLE_RIDERS=30
OPENRADLR_TARGET_RIDERS=6
OPENRADLR_BROADCAST_HZ=2
OPENRADLR_CLIENT_IP_HEADER=Fly-Client-IP
OPENRADLR_TRUST_PROXY=false
# With a 1 GB volume on /app/data: OPENRADLR_SECRET_KEY as a secret, so Strava logins survive deploys.
```

Measured with exactly these values: 1.9 % of one core with 20 riders, 3.1 %
with 30, 0.8 % idle; 14 to 16 kB/s to each rider, 50 to 57 MB per rider-hour.
The earlier review put Fly's shared CPU at about 1/16 of a core sustained
(6 %); these values stay under it on this machine's core, with less margin on
a slower one.

### 2-core VPS (Docker Compose, Caddy in front)

```bash
OPENRADLR_MAX_PLAYERS=50
OPENRADLR_MAX_PADDLE_PLAYERS=20
OPENRADLR_MAX_VISIBLE_RIDERS=60
OPENRADLR_TARGET_RIDERS=12
OPENRADLR_BROADCAST_HZ=4
OPENRADLR_TRUST_PROXY=true          # Caddy on the same machine is the only way in
OPENRADLR_HTTP_BIND=127.0.0.1
OPENRADLR_SECRET_KEY=<secret>       # the data volume keeps Strava logins
OPENRADLR_METRICS_TOKEN=<secret>    # only if Prometheus scrapes it
```

Measured with exactly these values: 6.4 % of one core with 50 riders on one
route (5.2 % with 30, 1.3 % idle), 21 MiB of memory; 56 to 64 kB/s to each
rider, 200 to 230 MB per rider-hour. 50 riders are 22 Mbit/s and 10 GB an
hour: on a plan with metered traffic set `OPENRADLR_MAX_VISIBLE_RIDERS=30`
(100 MB per rider-hour). The compose file needs the new variables first (see
above).

## Not verified

- No run on a real host: the client address header of each platform, sleep and
  wake-up of a free plan, and the CPU of a throttled shared core are from
  documentation and from this machine, not from a deployment.
- No Docker build here (no Docker daemon); the binary was built with the same
  command as the Dockerfile's.
- Strava was a stand-in server in the tests. The real consent page, the limit
  of one athlete and Strava's answers to a withdrawn permission (400 on a
  refresh, 401 on a call) are from Strava's documentation.
