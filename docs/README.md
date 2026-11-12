# Documentation

GOCARMO Ride is a modified version of
[OpenRadlr](https://github.com/Lethonium/OpenRadlr). Most pages in this folder
are the original project's documentation, kept as its authors wrote it: they
say "OpenRadlr", and they describe the original project's own servers, release
process and app.

## Pages written for this fork

| Page | What it covers |
| --- | --- |
| [gocarmo-deploy.md](gocarmo-deploy.md) | Running GOCARMO Ride on `ride.gocarmo.com`: the free host, the two paid fallbacks, the settings, Strava, updating, stopping, the source link |
| [gocarmo-server-settings.md](gocarmo-server-settings.md) | What the fork's server does differently, every setting it adds, measured values |

## The original project's pages (unchanged)

[architecture.md](architecture.md), [protocol.md](protocol.md),
[deploy.md](deploy.md), [devices.md](devices.md), [routes.md](routes.md),
[events.md](events.md), [workouts.md](workouts.md), [ftp.md](ftp.md),
[splits.md](splits.md), [vehicles.md](vehicles.md), [app.md](app.md),
[releases.md](releases.md), the decision records in [adr/](adr/) and the
design notes in [superpowers/](superpowers/).

Three of them describe parts that this fork does not ship:

- [app.md](app.md) and [adr/0021-native-app-shell.md](adr/0021-native-app-shell.md)
  describe the native iOS and Android app in `app/`. The folder is not in this
  fork.
- The section "Landing page" of [deploy.md](deploy.md) describes the marketing
  site in `landing/`. The folder is not in this fork, and the `landing`
  profile is gone from `docker-compose.yml`.
- [releases.md](releases.md) describes the original project's automated
  releases. This fork has no release automation.

Both folders are in the original repository at the commit this fork started
from:
<https://github.com/Lethonium/OpenRadlr/tree/2b09a79b34b8fb0d2f7c81d3a7acb150b8e23190>.

The screenshots in [assets/](assets/) are the original project's artwork:
Artwork © The OpenRadlr contributors, CC BY-SA 4.0,
<https://github.com/Lethonium/OpenRadlr>, unchanged. See
[../ASSETS-LICENSE.md](../ASSETS-LICENSE.md).
