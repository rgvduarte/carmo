# GOCARMO Ride

Indoor cycling in the browser, for gocarmo.com: connect a smart trainer over
Bluetooth and ride with others.

GOCARMO Ride is a modified version (a fork) of
[OpenRadlr](https://github.com/Lethonium/OpenRadlr), © The OpenRadlr
contributors, changed since 12 November 2026 from commit `2b09a79` and
maintained by GOCARMO. It is not the official OpenRadlr and is not affiliated
with or endorsed by its authors.

- **Licence**: GNU Affero General Public License, version 3 or (at your
  option) any later version. See [LICENSE](LICENSE). The changes of this fork
  are under the same licence.
- **What this fork changes, credits and third-party material**:
  [NOTICE.md](NOTICE.md).
- **Source of the running game**: this branch, `gocarmo-ride`, of
  <https://github.com/rgvduarte/carmo>. The game's "Source code" link opens
  the commit that is running.

## Where things are

| | |
| --- | --- |
| [README-upstream.md](README-upstream.md) | The original project's README, unchanged: what the game does, how to build and run it, every setting. It describes OpenRadlr; its links to `landing/` and `app/` lead nowhere here, because this fork does not ship those two folders. |
| [docs/gocarmo-deploy.md](docs/gocarmo-deploy.md) | How GOCARMO Ride is deployed: the free pilot on Render, the paid fallbacks, Strava, the source link. |
| [docs/gocarmo-server-settings.md](docs/gocarmo-server-settings.md) | What the fork's server does differently and the settings it adds. |
| [docs/gocarmo-strava.md](docs/gocarmo-strava.md) | The end of a ride: the finish dialog, the ride image, what goes to Strava and under which of Strava's rules. |
| [docs/README.md](docs/README.md) | Which pages in `docs/` are the original project's. |

## Run it

As in the original (Docker, or Rust and Node on the machine):

```bash
make up      # Docker Compose: build and start on http://localhost:8080
make dev     # or: the server with cargo, serving client/public
make check   # lint and all tests
```

## Names, artwork and problems

- "OpenRadlr" and its lemon logo belong to the original project: see
  [TRADEMARKS.md](TRADEMARKS.md). The original's artwork kept in this
  repository (`docs/assets/`) is © The OpenRadlr contributors, CC BY-SA 4.0:
  see [ASSETS-LICENSE.md](ASSETS-LICENSE.md).
- The GOCARMO artwork in `client/public/brand/` is © Gonçalo Carmo, CC BY-SA
  4.0. The name "GOCARMO", "GOCARMO Ride" and the sun-and-moon symbol are
  reserved as a brand: a fork of this fork picks its own name and icon. See
  [NOTICE.md](NOTICE.md).
- Problems with GOCARMO Ride go to GOCARMO (gocarmo.com), not to the OpenRadlr
  project: its authors did not make these changes.
