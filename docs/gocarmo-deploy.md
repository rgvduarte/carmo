# Deploying GOCARMO Ride

GOCARMO Ride is a modified version of
[OpenRadlr](https://github.com/Lethonium/OpenRadlr). This page is the fork's
own deploy guide. The original project's guide is [deploy.md](deploy.md); the
settings the fork adds, with measurements, are in
[gocarmo-server-settings.md](gocarmo-server-settings.md).

Hosting facts below were read on the providers' own pages on 12 November 2026
(sources at the end). Anything not confirmed there is marked "unconfirmed".
Nothing on this page has run on a real host yet: see
[What only a first run can confirm](#what-only-a-first-run-can-confirm).

## What is deployed

One Docker image (`Dockerfile`): the Rust game server plus the browser client.
The server serves the whole game on its own host, `https://ride.gocarmo.com`.
The site page `https://gocarmo.com/ride/` shows it in a frame on a computer,
links to it as a full page on a phone, and reads `/api/info` for a status
line. Everything is set with environment variables. No host needs a build
step of its own.

| Host | File | Cost | For |
| --- | --- | --- | --- |
| Render, free web service | [`render.yaml`](../render.yaml) | 0 € | the public pilot |
| Fly.io | [`fly.toml`](../fly.toml), [`ride-deploy-fly.yml`](../.github/workflows/ride-deploy-fly.yml) | about 3 USD a month | first paid fallback |
| A VPS with Docker Compose and Caddy | [`deploy/gocarmo.env.example`](../deploy/gocarmo.env.example) | from 4.69 € a month | second paid fallback |

Only one of them serves `ride.gocarmo.com` at a time.

## The order: commit, push, deploy

The licence (AGPL, section 13) gives every rider the right to the source of
the version that is running. The game's "Source code" link points at the
commit of the running build. So:

1. **Commit** every change, also a change to a deploy file.
2. **Push** the commit to the public branch `gocarmo-ride` of
   <https://github.com/rgvduarte/carmo>.
3. **Deploy** that commit, and nothing else.

Render and the Fly workflow can only deploy what was pushed, so the order
holds by itself there. On a VPS use `make update`: it refuses to run with
uncommitted changes and builds what it pulled. Never edit files on the server.

Never force-push or rewrite `gocarmo-ride`: a build that is still running, or
a rider's cached page, links to a commit that must stay reachable.

Before the first push, and before every later one, the owner's standing rule
applies: what the original project asks in `LICENSE`, `ASSETS-LICENSE.md`,
`TRADEMARKS.md`, `CONTRIBUTING.md`, the file headers and the third-party
licences is checked first.

## 1. The free pilot: Render

Render's free web service is the host of the pilot. The owner already has a
Render workspace (plan Hobby, 0 USD, no payment method) with one other
service in it.

### What the free plan is

| Fact | What it means here |
| --- | --- |
| 0.1 CPU, 512 MB | About 30 riders at once. The limit is set to 30 trainer riders and 10 phone riders. |
| No disk; files are "lost every time the service redeploys, restarts, or spins down" | Ride totals on the start screen start from zero again. Riders connected to Strava press "Connect" again. No ride is lost: a ride lives in the rider's browser until it is saved or uploaded. |
| Sleeps after 15 minutes without an HTTP request or a WebSocket message; waking "takes about one minute" | The first visitor after a quiet time sees Render's loading page for about a minute. A connected rider keeps the service awake, so a ride is not cut by the sleep rule. |
| 5 GB of outbound traffic a month for the whole workspace. Past it, without a payment method: "Render instead suspends all of your Free services for the remainder of the month" | The limit that bites first. See the budget below. The owner's other service goes dark too. |
| 750 free instance hours a month for the whole workspace; a sleeping service uses none | A game that never sleeps uses up to 744 of them. Never point an uptime monitor or a "keep awake" service at it. |
| "Render might restart a Free web service at any time" | Riders are dropped and the game connects them again. |
| 500 build minutes a month; past it, no new builds until the next month | One deploy is one build of the Rust server (3 min 45 s on this machine with two cores; on Render unconfirmed). Add `[skip render]` to the message of a commit that does not need a deploy. |
| Health checks: 5 s timeout; 15 s of failures stops traffic, 60 s restarts the instance | An overloaded server is restarted and drops every rider. One more reason for the rider limit. |
| One seat in the workspace | Only the owner sees the dashboard, the logs and the usage. |
| "Do not use them for production applications" | It is a pilot. |

### The traffic budget

Measured with the values in `render.yaml`
([gocarmo-server-settings.md](gocarmo-server-settings.md), "Free pilot"):

| What | Traffic |
| --- | --- |
| One rider riding for one hour | 34 to 38 MB |
| One first visit (the game's files) | 0.9 MB |
| One start screen in use, per hour | 0.25 MB (it asks `/api/info` every 30 s; 2 kB per answer) |

5 GB are about 130 rider-hours a month: for example 10 riders for one hour,
three times a week. A full house of 30 riders uses 1 GB in one hour.

The start screen asks the server only while its tab is visible, and stops
five minutes after the last key or pointer movement
(`client/public/js/net/infoPoll.js`). A tab forgotten on the start screen
therefore costs nothing and lets the service sleep. The original asked every
5 s for as long as the tab was open: 1.5 MB an hour, and a service that never
slept. During a ride the same question is asked every 30 s, which adds
0.25 MB to a rider-hour (the 34 to 38 MB above are the game connection
alone).

To use less: `OPENRADLR_MAX_VISIBLE_RIDERS=15` with `OPENRADLR_TARGET_RIDERS=4`
measured 25 to 28 MB per rider-hour (a rider then sees at most 15 others and
each route has fewer bots). A lower `OPENRADLR_MAX_PLAYERS` caps the worst
hour. Do not set `OPENRADLR_BROADCAST_HZ` below 2.

### Setting it up (once)

The owner does these in the browser. Nobody else needs his password.

1. The branch `gocarmo-ride` is pushed (see the order above).
2. In the Render Dashboard: **New > Blueprint**. Connect the repository
   `rgvduarte/carmo` (the Render GitHub App needs access to that one
   repository).
3. Blueprint name `gocarmo-ride`, branch `gocarmo-ride`. The Blueprint path
   stays `render.yaml`.
4. Render lists what it will create (one web service, plan Free, region
   Frankfurt) and asks for two values, `OPENRADLR_STRAVA_CLIENT_ID` and
   `OPENRADLR_STRAVA_CLIENT_SECRET`. With a Strava application ([Strava](#strava)):
   paste both. Without one: leave both empty. Whether Render accepts empty
   fields here is unconfirmed; if it does not, create the Strava application
   first. Never fill only one of the two: the server refuses to start.
5. **Deploy Blueprint**. Add no payment method.
6. DNS, at Cloudflare, zone `gocarmo.com`: a `CNAME` record, name `ride`,
   target the service's `onrender.com` host name (shown at the top of the
   service's page), proxy status **DNS only** (grey cloud). No `AAAA` record
   for `ride`. If the zone has `CAA` records, they must allow
   `letsencrypt.org` and `pki.goog`.
7. In the service's **Settings > Custom Domains**, `ride.gocarmo.com` is
   already listed (it comes from `render.yaml`): press **Verify** and wait
   until the certificate is issued.

Keep the cloud grey. Render's guide allows switching the record to "Proxied"
once the certificate is valid, and asks for the zone's SSL/TLS mode "Full"
for that. It is not needed here, it would put a second proxy and its
WebSocket rules in front of the game, and the SSL/TLS mode belongs to the
whole zone, the site included.

### Is it alive

- <https://ride.gocarmo.com/> shows the start screen of GOCARMO Ride. After a
  quiet time Render's loading page comes first, for about a minute.
- <https://ride.gocarmo.com/api/info> starts with `{"name":"GOCARMO Ride"` and
  carries `"build":{"sha":"<the deployed commit>"`.
- The start screen's foot shows the same build label, and "Source code" opens
  that commit on GitHub.
- Do not use `/robots.txt` as a test: while the service sleeps Render answers
  it itself and does not wake the service.

### Updating, rolling back, stopping

- **Update**: push to `gocarmo-ride`. Render builds and deploys the new
  commit. Riders are dropped when the old instance stops, and the game
  connects them to the new one. Deploy outside riding hours.
- **Changed settings in `render.yaml`**: Render applies them on the next push
  ("auto sync"). It never overwrites the two Strava values or the generated
  key, and it keeps variables that were added in the dashboard.
- **Roll back**: the service's Deploys page offers the two most recent
  earlier deploys on the free plan. Afterwards the running build is older
  than the branch head, and its source link still names its own commit.
- **Stop**: suspend the service at the foot of its Settings page (the exact
  label of the button is unconfirmed; Render's pages confirm that a service
  can be suspended by hand). A suspended service answers with an error page.
  To remove it for good: delete the service and the `ride` DNS record.

### When to leave the free plan

- Render's email that the traffic limit is near (it writes when a limit is
  approached and again when it is passed).
- Riders complain about the one-minute wait, or about pressing "Connect" for
  Strava again.
- More than about 30 riders want to ride at once.

Then either change the service's instance type to the smallest paid one
(7 USD a month, no sleep; traffic past 5 GB costs 0.15 USD per GB and needs a
payment method; a disk is 0.25 USD per GB a month), or move to Fly.io.

## 2. First paid fallback: Fly.io

Always on, one small machine in Paris, one volume for the ride totals and the
Strava logins. Not a free plan: it needs a credit card. Prices on 12.11.2026:

| Item | Price |
| --- | --- |
| Machine `shared-cpu-1x`, 256 MB | 2.19 USD a month in the cheapest regions; prices differ by region. Paris was 2.49 USD on the pricing page read on the morning of 12.11.2026; the regional table did not load when this page was written. |
| Volume, 1 GB | 0.15 USD a month |
| Outbound traffic, Europe | 0.02 USD per GB |
| Shared IPv4, IPv6, the certificate | free |
| A month's bill under 5 USD, personal organisation, card on file | not charged ("you don't pay it"); at 5 USD or more the whole bill is charged |

With the values in `fly.toml` a rider-hour is 50 to 57 MB, so 100 GB of
traffic (2 USD) are about 1,800 rider-hours.

### Setting it up (once)

1. The owner creates the Fly account and adds a card.
2. In Fly's dashboard he picks the organisation, opens **Tokens** and creates
   an organisation token. He stores it himself as the repository secret
   `FLY_API_TOKEN` (GitHub: Settings > Secrets and variables > Actions). It
   is never sent to anyone.
3. On the same GitHub page, tab Variables, he creates the repository variable
   `RIDE_DEPLOY` with the value `fly`. From then on every push to
   `gocarmo-ride` deploys. If the app name `gocarmo-ride` is taken on Fly:
   variable `RIDE_FLY_APP` with another name.
4. The next push runs
   [`ride-deploy-fly.yml`](../.github/workflows/ride-deploy-fly.yml). The
   first run creates the app, a 1 GB volume in Paris and the certificate for
   `ride.gocarmo.com`, deploys, and hands `/app/data` to the server's user.
5. DNS at Cloudflare: `CNAME`, name `ride`, target `<app>.fly.dev`, **DNS
   only**. If `ride` pointed at Render before: suspend the Render service and
   change the record's target.
6. Once the app exists, the organisation token can be replaced by a token of
   that one app (the app's **Tokens** page), which can deploy nothing else.

The volume: a new volume belongs to `root` and the server runs as user 10001.
Until `/app/data` is handed over, the server runs but cannot save the ride
totals, and it would not start with Strava and `OPENRADLR_SECRET_KEY` set.
The workflow tries `fly ssh console --command "chown 10001:10001 /app/data"`
after each deploy and prints a warning when that fails; then run the same
command once by hand.

Strava on Fly: the three values are secrets of the app
(`fly secrets set OPENRADLR_STRAVA_CLIENT_ID=... OPENRADLR_STRAVA_CLIENT_SECRET=... OPENRADLR_SECRET_KEY=...`,
typed by the owner; setting a secret restarts the machine). Whether Fly's
dashboard offers a form for secrets is unconfirmed.

The manual trigger: GitHub shows a workflow's "Run workflow" button only when
the workflow file is on the default branch. This repository's default branch
is the site, so the button is not there. After the workflow has run once,
`gh workflow run ride-deploy-fly.yml --ref gocarmo-ride` starts it; otherwise
push a commit.

- **Update**: push. The machine is replaced; riders are dropped for some
  seconds.
- **Stop**: set `RIDE_DEPLOY` to anything else (no more deploys) and stop the
  machine in Fly's dashboard. The volume keeps costing 0.15 USD a month, and
  what a stopped machine itself costs is unconfirmed. To end every cost:
  delete the app.

## 3. Second paid fallback: a VPS

The original project's own path, unchanged: Docker Compose, with the bundled
Caddy for HTTPS ([deploy.md](deploy.md)). A fixed price and traffic that is
not metered, at the cost of a Linux server to keep up to date.

Prices on 12.11.2026: OVHcloud VPS-1 (2 vCores, 4 GB, 40 GB, unmetered
traffic, daily backup) 4.69 € a month including VAT; the commitment that
price needs is unconfirmed. Hetzner Cloud from 5.49 € a month before VAT,
with a "Currently not available" notice on part of its page.

1. DNS at Cloudflare: an `A` record, name `ride`, the server's address, **DNS
   only**.
2. On the server, with Docker installed and ports 80 and 443 open:

   ```bash
   git clone --branch gocarmo-ride --single-branch https://github.com/rgvduarte/carmo.git gocarmo-ride
   cd gocarmo-ride
   cp deploy/gocarmo.env.example .env    # read it once, top to bottom
   make up
   ```

3. **Update**: `make update` (pulls, rebuilds, restarts; it asks first when
   riders are on). **Stop**: `make down`. Back up the `data` volume as
   [deploy.md](deploy.md) describes.

`make up` and `make update` pass the commit to the build, so the source link
is exact here too.

## The settings, host by host

Names are the original's (`OPENRADLR_...`). "new" marks the settings this
fork adds. Values come from
[gocarmo-server-settings.md](gocarmo-server-settings.md), where each set was
measured.

| Setting | Render (free pilot) | Fly.io | VPS |
| --- | --- | --- | --- |
| `OPENRADLR_PUBLIC_URL` | `https://ride.gocarmo.com` | same | same |
| `OPENRADLR_FRAME_ANCESTORS` (new) | `https://gocarmo.com,https://www.gocarmo.com` | same | same |
| `OPENRADLR_ALLOWED_ORIGINS` (also answers CORS now) | `https://ride.gocarmo.com,https://gocarmo.com,https://www.gocarmo.com` | same | same |
| `OPENRADLR_CLIENT_IP_HEADER` (new) | `CF-Connecting-IP` | `Fly-Client-IP` | empty |
| `OPENRADLR_TRUST_PROXY` | `false` | `false` | `true` (Caddy is the only way in) |
| `OPENRADLR_MAX_CONNECTIONS_PER_IP` | 8 | 8 | 8 |
| `OPENRADLR_MAX_PLAYERS` | 30 | 30 | 50 |
| `OPENRADLR_MAX_PADDLE_PLAYERS` | 10 | 10 | 20 |
| `OPENRADLR_MAX_VISIBLE_RIDERS` | 20 | 30 | 60 |
| `OPENRADLR_TARGET_RIDERS` | 6 | 6 | 12 |
| `OPENRADLR_BROADCAST_HZ` | 2 | 2 | 4 |
| `OPENRADLR_SEND_BUFFER_BYTES` (new) | 131072 | 131072 | 131072 |
| `OPENRADLR_ALLOW_SIMULATED_TRAINER` | `true` | `true` | `true` |
| `OPENRADLR_ALLOW_PADDLE_MODE` | `true` | `true` | `true` |
| `OPENRADLR_STRAVA_CLIENT_ID`, `OPENRADLR_STRAVA_CLIENT_SECRET` | typed in the dashboard | Fly secrets | in `.env` on the server |
| `OPENRADLR_STRAVA_LIMITED` (new) | `true` | `true` | `true` |
| `OPENRADLR_SECRET_KEY` | generated by Render | Fly secret | in `.env` on the server |
| `OPENRADLR_OBN_URL`, `OPENRADLR_OBN_APP_ID` (new) | not set | not set | empty |
| `OPENRADLR_METRICS_TOKEN` (new) | not set | not set | empty |
| `OPENRADLR_SERVER_NAME` | image default `GOCARMO Ride` | image default | `GOCARMO Ride` |
| `PORT` (Render's own) | 8080 | – | – |
| `COMPOSE_PROFILES`, `OPENRADLR_DOMAIN`, `OPENRADLR_HTTP_BIND` (Compose's own) | – | – | `tls`, `ride.gocarmo.com`, `127.0.0.1` |
| Traffic per rider-hour, measured | 34 to 38 MB | 50 to 57 MB | 200 to 230 MB |
| Disk | none | 1 GB volume | `data` volume |

The client address: behind a platform's proxy the server must take the
visitor's address from the header that platform writes, or every rider counts
as one address and the ninth connection is refused. On Render that header is
`CF-Connecting-IP` (from an article by Render, not from its reference pages);
on Fly it is `Fly-Client-IP`. Set `OPENRADLR_CLIENT_IP_HEADER` only where the
server cannot be reached around that proxy.

## Strava

What riders get: "Connect with Strava", upload of the finished ride as a
virtual ride with a map, and `.fit`, `.tcx` and `.gpx` downloads. Say these
four things to riders plainly, wherever Strava is offered:

- Strava's API cannot attach a photo. The summary image is saved or shared by
  the rider and added to the activity by hand. Never promise an automatic
  photo.
- A new Strava application accepts one athlete. Until Strava allows more,
  everyone else downloads the `.fit` file and uploads it at
  <https://www.strava.com/upload/select>.
- Rides on the simulated trainer or the phone paddles are not uploaded.
- On the free host a rider is asked to connect again after the server has
  restarted or slept.

### The Strava application

Strava's own pages say, on 12.11.2026: creating an application needs a Strava
subscription; "All new applications start in single-player mode", in which
only the account that owns the application can connect; from the API settings
page the access can be raised to an "Athlete capacity of 10"; beyond 10
connected athletes Strava reviews the application.

1. With the Strava account that will ride first, open
   <https://www.strava.com/settings/api> and create the application:

   | Field | Value |
   | --- | --- |
   | Application Name | `GOCARMO Ride` (Strava's name must not appear in it) |
   | Category | the closest to indoor training |
   | Website | `https://gocarmo.com/ride/` |
   | Application Description | `Indoor cycling in the browser, on gocarmo.com.` |
   | Authorization Callback Domain | `ride.gocarmo.com` (the host only: no `https://`, no path) |
   | Icon | GOCARMO's own (`client/public/brand/icon-512.png`); never a Strava logo |

   The address Strava sends riders back to is
   `https://ride.gocarmo.com/auth/strava/callback`.
2. The page then shows the Client ID and the Client Secret. They go to the
   host and nowhere else: not into a file of this repository, not into a
   chat, not into an email.

   | Host | Where the owner types them |
   | --- | --- |
   | Render | when the Blueprint is created, or later on the service's Environment page |
   | Fly.io | `fly secrets set ...` |
   | VPS | `.env` on the server |

   `OPENRADLR_SECRET_KEY` is the third value. It encrypts the stored logins.
   Render generates it; elsewhere it is a random string of 16 or more
   characters (`openssl rand -hex 32`) that is set once and never changed.
3. Check: the start screen offers "Connect with Strava", and the owner's own
   account connects.

### More than one athlete

1. On <https://www.strava.com/settings/api>, raise the access to 10 athletes
   (how the page offers this was not seen: unconfirmed).
2. For more than 10: Strava's Developer Program form,
   <https://share.hsforms.com/1VXSwPUYqSH6IxK0y51FjHwcnkd8>. Strava asks for
   screenshots of every place where Strava data is shown and of the "Connect
   with Strava" button, and checks its brand guidelines. "Increased access is
   not guaranteed."
3. Tell the game: while `OPENRADLR_STRAVA_LIMITED` is `true` (the default),
   a rider who is not connected is told about the limit and offered the
   `.fit` file first, with Strava's button after it. Set it to `false` on the
   host once Strava's limit is high enough for the riders you expect; the
   button then comes first. The server only reports the value in `/api/info`
   (`strava.limited`); it does not count athletes.

### Strava's rules that touch this fork

From the API Agreement (effective 1 June 2026) and the Brand Guidelines:

- The application's name must not contain "Strava". No part of a Strava logo
  as the icon. Nothing may suggest that Strava made or endorses the game.
- The connect button is Strava's own "Connect with Strava" button, unchanged.
  A link back to an activity reads "View on Strava".
- A user's data is not shared without that user's consent. The fork uploads a
  rider's own ride to that rider's own account and shows no other Strava data.
- The Client Secret and the tokens are kept confidential. The server never
  logs tokens.
- Strava may change or end API access at any time and sets the limits
  (200 requests per 15 minutes and 2,000 a day for a new application).

## The source link and the build label

The Dockerfile writes the commit into `client/public/js/build.js` and into
the server's environment. The client shows it at the foot of the start screen
and uses it for every "Source code" link
(`https://github.com/rgvduarte/carmo/tree/<commit>`); the server reports it
in `/api/info`. When both differ, the client knows its cached copy is old.

| Where it is built | Where the commit comes from |
| --- | --- |
| Render | Render hands a Docker build its variables as build arguments; the Dockerfile takes `RENDER_GIT_COMMIT` when `OPENRADLR_BUILD_SHA` is not given |
| Fly workflow | `--build-arg OPENRADLR_BUILD_SHA=<github.sha>` |
| `make up`, `make update` | `git rev-parse --short HEAD` |
| CI | `OPENRADLR_BUILD_SHA=<github.sha>` (the image is checked and thrown away) |
| A build with none of these | the label is `dev` and the link points at the branch `gocarmo-ride` |

The image also carries `LICENSE` and `NOTICE.md` in `/app`, serves them as
`/LICENSE.txt` and `/NOTICE.txt`, and names its source and its licence in its
labels.

## The workflows

| File | Runs on | Does |
| --- | --- | --- |
| [`ride-ci.yml`](../.github/workflows/ride-ci.yml) | push to `gocarmo-ride` | server: rustfmt, clippy, tests; client: lint, tests; builds the image without pushing it and runs [`deploy/check-image.sh`](../deploy/check-image.sh) on it |
| [`ride-deploy-fly.yml`](../.github/workflows/ride-deploy-fly.yml) | push to `gocarmo-ride`, manual | skipped unless the variable `RIDE_DEPLOY` is `fly`; then deploys to Fly.io |

Both have a read-only token. Only the second uses a secret. Their actions are
pinned to commits; nothing updates the pins by itself (the original's
Dependabot file is not in this fork, and Dependabot reads only the default
branch). To refresh one: `git ls-remote --tags https://github.com/<owner>/<action>`
and replace the commit and the version in the comment.

The deploy workflow does not wait for the CI workflow. Run `make check`
before pushing.

## What only a first run can confirm

Checked on the development machine: the Dockerfile builds end to end, the
image passes `deploy/check-image.sh`, the build label logic, the three sets
of settings against the fork's server (it starts, allows framing by
gocarmo.com only, answers CORS for the listed origins only), the Compose file
(`docker compose config`), both workflows with actionlint.

The first CI run:

- the three jobs pass on GitHub's runners, with the current stable Rust (a
  new clippy lint can fail a build that passed here);
- the image builds with the GitHub cache and the check script passes there.

The first deploy on Render:

- Render accepts `render.yaml` and creates a free service in Frankfurt;
- the Blueprint form accepts empty Strava fields;
- the build passes on Render (it uses BuildKit; the Dockerfile's cache
  mounts are not mentioned in its pages) and how many build minutes it takes;
- `/api/info` reports the commit, which shows that Render passed
  `RENDER_GIT_COMMIT` to the build. If it reports `dev`, the source link
  points at the branch, and the commit has to reach the build another way;
- `CF-Connecting-IP` reaches the server on WebSocket requests: nine riders
  from different networks can ride at once;
- what a page of gocarmo.com receives from `/api/info` while the service
  wakes, and whether Render's loading page shows inside the frame;
- the time to wake;
- that the certificate is issued with the grey cloud and Bluetooth works
  inside the frame on `https://gocarmo.com/ride/`.

The first deploy on Fly.io: everything in `fly.toml` and in the workflow
(written from the documentation only), the volume's owner, `Fly-Client-IP`,
and the price of the machine in Paris.

Strava: the form's fields, the step from 1 to 10 athletes, a real upload.

## Sources (read 12.11.2026)

Render: <https://render.com/docs/free>, <https://render.com/docs/blueprint-spec>,
<https://render.com/schema/render.yaml.json>,
<https://render.com/docs/infrastructure-as-code>, <https://render.com/docs/docker>,
<https://render.com/docs/environment-variables>, <https://render.com/docs/web-services>,
<https://render.com/docs/health-checks>, <https://render.com/docs/deploys>,
<https://render.com/docs/custom-domains>, <https://render.com/docs/configure-cloudflare-dns>,
<https://render.com/docs/outbound-bandwidth>, <https://render.com/pricing>,
<https://render.com/articles/host-pocketbase-on-render> (8 July 2026, the
client address header).

Fly.io: <https://docs.fly.io/reference/configuration>,
<https://docs.fly.io/launch/continuous-deployment-with-github-actions>,
<https://docs.fly.io/about/pricing>, <https://docs.fly.io/about/free-waiver>,
<https://docs.fly.io/networking/request-headers>, <https://docs.fly.io/networking/custom-domain>,
<https://docs.fly.io/volumes/overview>, <https://docs.fly.io/launch/volume-storage>,
<https://docs.fly.io/security/tokens>, <https://docs.fly.io/apps/secrets>,
<https://docs.fly.io/flyctl/deploy>, <https://docs.fly.io/flyctl/apps-create>,
<https://docs.fly.io/flyctl/volumes-create>, <https://docs.fly.io/flyctl/certs-add>.

VPS: <https://www.ovhcloud.com/pt/vps/>, <https://www.hetzner.com/cloud/>.

Strava: <https://developers.strava.com/docs/getting-started/>,
<https://developers.strava.com/docs/rate-limits/>,
<https://developers.strava.com/guidelines/>, <https://www.strava.com/legal/api>.

GitHub: <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>,
<https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow>.
