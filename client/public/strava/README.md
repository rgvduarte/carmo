# Strava's "Connect with Strava" button

`btn_strava_connect_with_orange.svg` is Strava's own artwork, exactly as Strava
provides it: the file `Connect with Strava Orange/btn_strava_connect_with_orange.svg`
of <https://developers.strava.com/downloads/1.1-Connect-with-Strava-Buttons.zip>,
downloaded on 12 November 2026 and not modified
(sha256 `cc5b78798ae02919cfde7c2d9f66a9298e51d2c0bb3e9523c9d9b1aec8a63857`).

It is here because Strava's API Brand Guidelines
(<https://developers.strava.com/guidelines/>, last revised 29 September 2025)
provide this button for starting the sign-in at Strava, and ask that Strava's
logos are never modified. It is the only third-party mark in GOCARMO Ride.

## Not ours, not under this repository's licences

Neither the AGPL (the code) nor CC BY-SA 4.0 (the artwork) covers this file.
The Strava name and logos belong to Strava, Inc. They are used under Strava's
API Agreement (<https://www.strava.com/legal/api>) and Brand Guidelines only,
by whoever runs a server with a Strava API application of their own. GOCARMO
Ride is not developed, sponsored or endorsed by Strava. A fork that does not
use Strava's API should remove this folder and the three links to it in
`index.html`.

## What the game keeps to (checked by `client/test/gocarmoRide.test.js`)

- The button is shown as provided, 237 × 48 px: not restyled, recoloured,
  cropped or animated.
- It links only to the server's `/auth/strava`, which redirects to
  `https://www.strava.com/oauth/authorize`.
- No other part of a Strava logo is in the game: no mark next to a text, no
  icon, nothing on the ride image; no control of the game's own is drawn in
  Strava's orange.
- A link to something on Strava reads "View on Strava" (in the rider's
  language) and is told apart by its weight and underline.
- The word Strava is plain text in sentences that say what the game does with
  it, never larger than the text around it and never part of the game's name.
