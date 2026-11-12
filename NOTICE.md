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

The original authors wrote OpenRadlr; GOCARMO maintains the changes listed
below and nothing else. This fork is not the official OpenRadlr and is not
endorsed by its authors.

## Licences (unchanged)

- **Code**: GNU Affero General Public License v3, see [LICENSE](LICENSE). The
  changes of this fork are under the same licence. The 3D world, riders and
  vehicles are drawn by code and fall under it too.
- **Upstream artwork**: Creative Commons Attribution-ShareAlike 4.0, see
  [ASSETS-LICENSE.md](ASSETS-LICENSE.md). "Artwork © The OpenRadlr
  contributors, CC BY-SA 4.0".
- **Name and logo of the original**: see [TRADEMARKS.md](TRADEMARKS.md). A fork
  must have its own name and icon, and may say what it is based on. That is why
  this fork is called GOCARMO Ride and shows "based on OpenRadlr" in its About
  dialog.

`LICENSE`, `ASSETS-LICENSE.md`, `TRADEMARKS.md` and every copyright notice are
kept as upstream wrote them.

## Where the credits show in the game

Start screen, foot of the page: "Sobre" / "About". Ride menu: Settings →
"About" → "Credits and licences". Both open the same dialog: fork name,
maintainer, "based on OpenRadlr, © The OpenRadlr contributors, AGPL-3.0
licence", that it is a modified version and since when, no warranty, and links
to this fork's source code, to the original project and to the licence text.

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
  "GOCARMO Ride" lockup (same file names and pixel sizes; plus
  `favicon.svg`, `gocarmo-ride.svg`, `gocarmo-ride-stacked.svg`). No upstream
  image file is used by the client any more.
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

## Third-party material added by this fork

- **Fonts** in `client/public/fonts/`: Anton (© The Anton Project Authors),
  Inter (© The Inter Project Authors) and JetBrains Mono (© The JetBrains
  Mono Project Authors), each under the SIL Open Font License 1.1; the
  licence texts are next to the files (`*-OFL.txt`).
- `gc-anton-tab.woff2` ("GC Anton Tab") is a modified version of Anton made
  for this fork: it holds only the digit 1, widened to the width of the other
  digits so that live numbers do not shift. Same licence (SIL OFL 1.1,
  `anton-OFL.txt`); Anton declares no Reserved Font Name.

## The GOCARMO name and symbol

"GOCARMO", "GOCARMO Ride" and the sun-and-moon symbol identify this fork and
gocarmo.com, the way "OpenRadlr" and the lemon identify the original. They are
not upstream artwork. The licences of the code and of the upstream artwork do
not give the right to use them as the name or logo of another product or
service: a fork of this fork should pick its own.

## Not changed, and not used by this fork

- `landing/` (upstream's landing page), `app/` (upstream's native app
  wrapper), `docs/` and `README.md` (apart from the note at its top that points here) still
  describe OpenRadlr and carry its name and artwork, unchanged, under their
  licences. They are kept as
  reference and are not built, deployed or published under the GOCARMO name.
  Before any of them is used, it has to be renamed and given GOCARMO's icon,
  as `TRADEMARKS.md` asks.
- `server/` is unmodified. The name riders see comes from the server setting
  `OPENRADLR_SERVER_NAME` ("GOCARMO Ride").
