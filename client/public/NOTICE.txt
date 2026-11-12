# GOCARMO Ride

GOCARMO Ride is a modified version (a fork) of **OpenRadlr**, the open-source
indoor-cycling game.

| | |
| --- | --- |
| Fork name | GOCARMO Ride |
| Maintainer of the fork | GOCARMO (gocarmo.com) |
| Based on | OpenRadlr, <https://github.com/Lethonium/OpenRadlr>, at commit `2b09a79` (`2b09a79b34b8fb0d2f7c81d3a7acb150b8e23190`) |
| Copyright of the original | © The OpenRadlr contributors |
| Modified from | 12.11.2026 (2026-11-12) |
| Source code of this fork | <https://github.com/rgvduarte/carmo/tree/gocarmo-ride> |
| GOCARMO artwork (added by this fork) | © Gonçalo Carmo, CC BY-SA 4.0; the name and the use as a brand are reserved (see "The GOCARMO name and symbol") |

The original authors wrote OpenRadlr; GOCARMO maintains the changes listed
below and nothing else. This fork is not the official OpenRadlr and is not
endorsed by its authors.

## Licences (unchanged)

- **Code**: GNU Affero General Public License, version 3 or (at your option)
  any later version (AGPL-3.0-or-later), see [LICENSE](LICENSE). The changes
  of this fork are under the same licence. The 3D world, riders and vehicles
  are drawn by code and fall under it too.
- **Upstream artwork**: Creative Commons Attribution-ShareAlike 4.0, see
  [ASSETS-LICENSE.md](ASSETS-LICENSE.md). "Artwork © The OpenRadlr
  contributors, CC BY-SA 4.0", <https://github.com/Lethonium/OpenRadlr>,
  unchanged; kept in `docs/assets/` only, where the original's README
  (`README-upstream.md`) shows it. The game uses none of it.
- **Name and logo of the original**: see [TRADEMARKS.md](TRADEMARKS.md). A fork
  must have its own name and icon, and may say what it is based on. That is why
  this fork is called GOCARMO Ride and shows "based on OpenRadlr" in its About
  dialog.

`LICENSE`, `ASSETS-LICENSE.md`, `TRADEMARKS.md` and every copyright notice are
kept as upstream wrote them.

What this fork adds has its own notices: the GOCARMO artwork (see "The
GOCARMO name and symbol") and the fonts (see "Third-party material added by
this fork").

## Where the credits show in the game

Start screen, foot of the page: "Sobre" / "About" and, beside it, a direct
link "Código-fonte" / "Source code". Ride menu: Settings → "About" →
"Credits and licences", with the same direct link beside the button. Both
buttons open the same dialog: fork name, maintainer, "based on OpenRadlr,
© The OpenRadlr contributors, AGPL-3.0-or-later licence", that it is a
modified version of which commit and since when, that it is not the official
OpenRadlr, what a rider may do with it (use, change, share, under the GNU
AGPL version 3 or later), no warranty, and links to this fork's source code,
to the original project, to the licence text and to this notice.

- The source link points at the commit of the running build when the build
  knows it (`client/public/js/build.js`, written by the Dockerfile from the
  build argument `OPENRADLR_BUILD_SHA`, or from Render's `RENDER_GIT_COMMIT`
  when the first is not given; a deploy without Docker must write that
  file), else at the branch `gocarmo-ride`
  (`client/public/js/view/about.js`). Every deploy path passes the commit:
  see `docs/gocarmo-deploy.md`, "The source link and the build label".
- The licence and this notice are served with the game:
  `client/public/LICENSE.txt` and `client/public/NOTICE.txt` are copies of
  `LICENSE` and `NOTICE.md` (a test keeps them identical; copy again after
  every edit of this file). The Docker image also carries `LICENSE` and
  `NOTICE.md` in `/app`, and its labels name the source repository and the
  licence.
- The dev-only model gallery (`client/public/gallery.html`) carries the source
  link too.

## Changes made by this fork

Keep this list up to date with every change.

### 12.11.2026 — client skin (`client/`)

- **Name**: every name shown to riders says "GOCARMO Ride" instead of
  "OpenRadlr": page title, description, web app manifest (`GOCARMO Ride`,
  short `GC Ride`), the header and HUD wordmark, all texts in
  `js/i18n/en.js` and `js/i18n/de.js`, the ride photo watermark, the summary
  card, the names of rides sent to Strava, the creator field and the file
  names of exported rides and photos (`gocarmo-ride-…`), the device
  diagnostics report, and the start/finish arch in the 3D world ("GOCARMO").
  The name lives in one place, `js/brand.js`. Storage keys, the app URL
  scheme, protocol fields, environment variables and file names inside the
  repository keep their upstream names.
- **Logo and icons**: the lemon brand mark and app icons in
  `client/public/icons/` are replaced by GOCARMO's sun-and-moon symbol and a
  "GOCARMO Ride" lockup (same pixel sizes; plus `favicon.svg`,
  `gocarmo-ride.svg`, `gocarmo-ride-stacked.svg`), since moved to
  `client/public/brand/` (see below). No upstream image file is used by the
  client any more.
- **Golden lemons**: the collectible that upstream draws as a lemon (its
  mascot) is drawn as a golden sun, in the 3D world
  (`js/view3d/lemonModel.js`) and on the 2D map (`js/view/rideMapView.js`),
  and its texts say "golden sun". The game rule is unchanged, and so are the
  internal names (`lemons.js`, storage key).
- **Look**: the colours in `styles.css` follow gocarmo.com: near-black
  surfaces, off-white text, gold (`#e6b450`) as the accent with dark text on
  it, the rider's own marker and jersey in gold, 14 px corners. Pending and
  warning states moved from yellow to orange so they are not read as the
  accent; danger, climb, sprint, human, bot and zone colours are upstream's.
  Titles and numbers are set in Anton, text in Inter, code in JetBrains
  Mono, all served from `client/public/fonts/` (no request to a font
  service). In the 3D world: the start arch, the halfway banner, the picked
  route's highlight on the island and the café's awning, parasols and sign
  are gold where upstream has its orange; the studio's neon is cream and
  gold; the bot team "zitrone" rides in lime and "kreide" lost its warm tint
  (both sat on the hue of the rider's gold); the studio instructor is called
  "Coach Sol" (upstream: "Coach Lemon").
- **Portuguese**: new locale `js/i18n/pt.js` (European Portuguese, every key
  of `en.js`), offered in the language selector and picked for browsers set
  to any Portuguese; English and German stay. `intlLocale()` in
  `js/i18n/i18n.js` makes numbers, dates, plurals, the page language and the
  coach's voice follow `pt-PT`.
- **About dialog**: `js/view/about.js`, markup in `index.html`, texts under
  `about.*` in the three dictionaries.
- **Pixel font**: glyphs `C` and `G` added (`js/view3d/pixelFont.js`), needed
  to write the arch.
- **Summary card**: its legend ("Power", "Elevation") is in the rider's
  language (new key `photos.stat.elevation`).
- **Tests** (`client/test/`): expectations that named "OpenRadlr", the old
  file names, the old colours or two languages follow the changes above;
  new `i18nPortuguese.test.js`.

### 12.11.2026 — after the brand and licence reviews

- **Repository**: `README.md` is this fork's own; upstream's README is kept
  unchanged as `README-upstream.md`. Removed, because they act on upstream's
  repository and people: `.github/CODEOWNERS` and the workflows
  `release-please.yml`, `dependabot-auto-merge.yml`, `scorecard.yml`.
- **Logo files moved**: GOCARMO's icons and lockups are in
  `client/public/brand/` (was `client/public/icons/`, the folder
  `ASSETS-LICENSE.md` lists for upstream's artwork). Upstream's `brand-mark.png`
  slot is gone; the apple touch icon uses the composition of the 192 px icon.
  The web app manifest is described in Portuguese.
- **Licence items in the client**: the source link, the licence wording
  ("or later"), the served copies of the licence and of this notice, the
  credit for the map data of one route (see "Third-party material"), as
  described under "Where the credits show in the game".
- **Look**, closer to gocarmo.com (`styles.css`): titles in Anton, slanted
  and upper case; small labels in JetBrains Mono; the main button is a pill
  and stays the only gold fill, what is switched on is off-white; no blue or
  orange glow on the start page; neutral near-black surfaces where upstream's
  were blue-grey; the start page's text on a darker veil; the map's sea
  darker (`js/view/rideMapTheme.js`). On a phone: the numbers of the paddle
  ride on a dark card, the gym workout's boxes no longer overlap, a small
  lockup at the foot of the cockpit.
- **Phone paddles**: the letters on the paddles and the tap rate are
  translated (new keys `ride.paddleLetterLeft`, `ride.paddleLetterRight`,
  `ride.paddleRate`); the leftover yellow is gold.
- **Photos and summary card** (`js/view/photos.js`): the lockup instead of a
  text line, the route in Anton, labels in mono, the site's colours, Anton
  never asked for in bold, an upright layout for phone photos, the app's name
  once (`withServer` in `js/brand.js`, also for the finish dialog).
- **Events** (`js/view/events.js`): the server's own English names
  ("Group ride · …", "Race · …") are shown in the rider's language; an
  organiser's own name is kept; the emoji in front of the names are gone. The
  count of phone riders in the server line is a translated text (new key
  `menu.server.withPhones`).
- **3D world**: the start/finish arch is a near-black band with gold edges
  and the lockup drawn from its outlines (`js/view3d/gocarmoMark.js`,
  `markBeam` in `banners.js`, `world.js`, both biomes); the collectible sun is
  a flat disc with eight rays that faces the rider (`lemonModel.js`,
  `view3d.js`); the rider's own jersey is lifted so it reads as the page's
  gold under the world's light (`jerseyTint` in `view3d.js`); in the studio
  the instructor rides in cream, is named in the rider's language (new key
  `studio.coachName`) and has no "coach" badge.
- **Portuguese wording**: countdowns say "daqui a …", "simulador" and "D+"
  are used throughout, shorter paddle hints, the community line and the
  events text reworded.
- **Tests**: `events.test.js` follows the change above; new
  `gocarmoRide.test.js` (source link, licence copies, credits, logo folder,
  symbol, event names, arch lockup, sun).

### 12.11.2026 — repository, image and deploy files

- **Removed**: `landing/` (the original's marketing site) and `app/` (its
  native iOS and Android wrapper, with the original's app id and icons).
  GOCARMO Ride ships neither. Both are unchanged in the original repository:
  <https://github.com/Lethonium/OpenRadlr/tree/2b09a79b34b8fb0d2f7c81d3a7acb150b8e23190>.
  With them went the `landing` service of `docker-compose.yml`, the landing
  block of `deploy/Caddyfile` and the landing settings of `.env.example`.
- **`.github/`**: nothing of the original's automation is left. Removed, in
  addition to the files named above: `dependabot.yml`, the issue templates
  (their links sent reports to the original project) and the pull request
  template. `ci.yml` became `ride-ci.yml`: it runs on pushes to
  `gocarmo-ride` only, and builds and checks the Docker image without
  publishing it. New: `ride-deploy-fly.yml`, which deploys to Fly.io only
  when the repository variable `RIDE_DEPLOY` is `fly`.
  `release-please-config.json`, `.release-please-manifest.json` and
  `version.txt` are kept unchanged; no workflow uses them.
- **Docker image** (`Dockerfile`, `.dockerignore`): the image carries
  `LICENSE` and `NOTICE.md` and labels with its source and licence; the
  build label can come from Render's `RENDER_GIT_COMMIT`; the default server
  name is "GOCARMO Ride". The build stage, the user and the entry point are
  the original's.
- **Docker Compose** (`docker-compose.yml`, `.env.example`): default name
  "GOCARMO Ride"; the settings this fork adds reach the container; so do the
  paddle, studio, events and AFK settings, which the original listed in
  `.env.example` but did not hand to the container.
- **New deploy files**: `render.yaml` (Render, the free pilot), `fly.toml`
  (Fly.io), `deploy/gocarmo.env.example` (a VPS with Docker Compose and
  Caddy), `deploy/check-image.sh` (checks a built image).
- **New documents**: `docs/gocarmo-deploy.md`, `docs/README.md` (which pages
  are the original's). `Makefile` and `deploy/Caddyfile`: one message and the
  comments name the fork.

### Still to be listed here before the branch is made public

**For whoever merges the branches (delete this heading when done):** the
changes below are in the branch but not yet described in this notice. Add one
dated entry for each, in the style of the entries above.

- [ ] **Server (`server/`)**: framing by listed sites and CORS on the public
  JSON API, the client address from a platform proxy's header, the bound on
  what a stalled client can hold, the closed `/internal/metrics`, the
  server's identity towards Strava and OpenBikeNet, the Strava answers
  changed by the fork. Source: `docs/gocarmo-server-settings.md` and the
  commits that touch `server/`.
- [ ] **Client, second round (`client/`)**: running inside a frame, the
  privacy text, the licence statement of the GOCARMO artwork
  (`client/public/brand/README.md`), the app id sent to OpenBikeControl
  devices, and what else the commits that touch `client/` changed.
- [ ] **Third-party material**: if the client branch brings Strava's
  "Connect with Strava" button file (`client/public/strava/`), list it under
  "Third-party material added by this fork": Strava's own artwork, unmodified,
  used under Strava's API Agreement and Brand Guidelines, not under this
  repository's licences.
- [ ] Copy this file to `client/public/NOTICE.txt` again.

## Third-party material added by this fork

- **Fonts** in `client/public/fonts/`: Anton (© The Anton Project Authors),
  Inter (© The Inter Project Authors) and JetBrains Mono (© The JetBrains
  Mono Project Authors), each under the SIL Open Font License 1.1; the
  licence texts are next to the files (`*-OFL.txt`).
- `gc-anton-tab.woff2` ("GC Anton Tab") is a modified version of Anton made
  for this fork: it holds only the digit 1, widened to the width of the other
  digits so that live numbers do not shift. Same licence (SIL OFL 1.1,
  `anton-OFL.txt`); Anton declares no Reserved Font Name.

## Third-party material inherited from upstream

- **Map data of one route.** `routes/lanzarote-lava-180.json` (and its source
  in `routes/sources/`) was made by upstream from OpenStreetMap and Copernicus
  data (`docs/routes.md`). Lanzarote Lava 180: Road geometry © OpenStreetMap
  contributors, ODbL. Elevation: Copernicus DEM GLO-30 © DLR e.V. 2010–2014
  and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by
  the European Union and ESA. The same credit shows in the game's About
  dialog (`about.data`).
- **Rust libraries.** The server is built from the libraries listed in
  `server/Cargo.lock`, each under its own permissive licence, as in the
  original. The server runs on GOCARMO's host and the Docker image is built
  there from this source; it is not published. Whoever publishes the image or
  the binary has to add the licence texts of those libraries to it.

## The GOCARMO name and symbol

"GOCARMO", "GOCARMO Ride" and the sun-and-moon symbol identify this fork and
gocarmo.com, the way "OpenRadlr" and the lemon identify the original.

- **The image files** in `client/public/brand/` (the symbol, the GOCARMO Ride
  lockups and the app icons made from them) were made for this fork from
  GOCARMO's own logo. They are not upstream artwork, and "Artwork © The
  OpenRadlr contributors" does not apply to them. They are **© Gonçalo
  Carmo**, licensed under the Creative Commons Attribution-ShareAlike 4.0
  International licence (CC BY-SA 4.0),
  <https://creativecommons.org/licenses/by-sa/4.0/>. Credit them as "GOCARMO
  artwork © Gonçalo Carmo, CC BY-SA 4.0".
- **The symbol drawn in code** (`client/public/index.html`,
  `client/public/js/brand.js`, `client/public/js/view3d/gocarmoMark.js`) is
  under the GNU AGPL, version 3 or later, like the rest of the code.
- **The name and the use as a brand are reserved.** These licences cover the
  copyright in the files and in the code, not the name or the symbol as a
  brand (AGPL section 7(e)); this is the model the original uses for its
  lemon. They give no right to use "GOCARMO", "GOCARMO Ride" or the symbol as
  the name, logo or app icon of another product or service. A fork of this
  fork picks its own name and icon.

`ASSETS-LICENSE.md` is the original project's text, kept unchanged. It
describes the original's artwork, not GOCARMO's. Of the folders it lists:

| Folder in `ASSETS-LICENSE.md` | In this fork |
| --- | --- |
| `docs/assets/` | kept, unchanged: the original's emblem and two screenshots |
| `client/public/icons/` | does not exist; none of its files is shipped. GOCARMO's own files are in `client/public/brand/` |
| `landing/public/`, `landing/src/assets/` | removed with `landing/` |

## Kept from the original, unchanged

- `README-upstream.md` (the original's README) and `docs/` (its
  documentation, see `docs/README.md`) still describe OpenRadlr and carry its
  name and artwork, unchanged, under their licences. They are kept as
  reference. Some of their links point at `landing/` and `app/`, which this
  fork removed.
- `LICENSE`, `ASSETS-LICENSE.md`, `TRADEMARKS.md`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md` and `AGENTS.md` are the
  original's files, unchanged. Where they say "this repository" or name
  maintainers, they mean the original project. Problems with GOCARMO Ride go
  to GOCARMO, not to the original project.
- Internal names are the original's: the settings start with `OPENRADLR_`,
  the server binary is `openradlr-server`, and the Docker Compose project,
  the image, the volumes and the cookies keep their names.
