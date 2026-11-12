# GOCARMO Ride and Strava: the end of a ride

What a rider gets when a ride ends, what the client hands to Strava, which of
Strava's rules the client keeps to, and what the person who runs the server
has to do at Strava. Upstream's own description of the Strava set-up is in
[deploy.md](deploy.md#strava-optional); this file is about the fork.

Rules read on 12 November 2026:

- Strava API Brand Guidelines, <https://developers.strava.com/guidelines/> (last revised 29 September 2025)
- Strava API Agreement, <https://www.strava.com/legal/api> (effective 1 June 2026)
- Strava API Policy, <https://www.strava.com/legal/api_policy> (effective 1 June 2026; part of the agreement)
- Rate limits and athlete capacity, <https://developers.strava.com/docs/rate-limits/>
- Getting started, <https://developers.strava.com/docs/getting-started/>
- Uploads, <https://developers.strava.com/docs/uploads/>, and the API reference, <https://developers.strava.com/docs/reference/>

## What Strava can and cannot do for the game

- **No pictures.** The public API has no call that adds a photo to an
  activity (the reference lists none; the rate-limit page names an
  `activities#upload_media` that is not offered to applications). The ride
  image is saved or shared by the rider and added to the activity by hand.
  The game never says otherwise.
- **An athlete limit.** A new API application can connect one account, its
  owner's ("single player mode"). The owner can raise that to ten in the
  application's settings. More than ten needs Strava's review, which is not
  guaranteed. Until then most riders cannot connect: they download the
  `.fit` file and upload it at <https://www.strava.com/upload/select>.
- **A Strava subscription** is needed to create an API application.
- **Sessions.** The server keeps Strava logins in memory unless it has a data
  directory and a secret key. On a host without a disk they are lost when the
  server restarts or wakes up; the rider then connects again. The finished
  ride is in the browser and is not lost.

## The finish dialog

`client/public/js/ride/finishPlan.js` decides what is offered, from the ride,
the server and the account. One button is the main one at a time.

| The ride and the rider | In front | Also there | Main button |
|---|---|---|---|
| connected, upload allowed | "Send to Strava" | the file by hand, folded | Send |
| sent | "Sent to Strava", "View on Strava" | the file, folded | Save image |
| upload failed, rejected or unanswered | what happened, "Send again" or "Try again" | the file by hand, open | Send |
| session lost (`not_connected`) | "The connection to Strava was lost", Strava's button | the file by hand, open | (Strava's button) |
| connected without the upload permission | Strava's button, "allow upload activities" | the file by hand, open | (Strava's button) |
| not connected, application past its limit | Strava's button | the file by hand, open | (Strava's button) |
| not connected, application under its limit, or the last attempt failed | the reason, the two steps, "Download .fit file" | Strava's button, after it | Download .fit |
| Strava switched off on the server | the reason, the two steps, "Download .fit file" | | Download .fit |
| simulated trainer | "not sent to Strava", the files | | Save image |
| phone paddles | "no ride files, nothing sent to Strava" | | Save image |
| too short | "ride a little longer" | | none |

Connecting does not lose the ride. With the tab to itself the game waits for
the finished ride to be saved in the browser, goes to Strava and comes back to
the start screen, where the saved ride opens again with "Send to Strava", its
`.fit` file and its image. Inside a frame the sign-in runs in a tab of its
own and the game picks the session up when the rider comes back.

### The athlete limit, as the client knows it

The client assumes the limit until the server says otherwise:
`/api/info` → `strava.limited: false` (read by `stravaLimited` in
`client/public/js/net/strava.js`). The fork's server sends the field from the
setting `OPENRADLR_STRAVA_LIMITED`, which is `true` unless the person who runs
the server changes it (the original's server does not send the field, which
the client reads as "limited"). Once Strava has approved the application for
enough athletes, set `OPENRADLR_STRAVA_LIMITED=false` on the host; until then
riders who are not connected see the file first, with Strava's button after
it. The server does not count athletes: the value is what the operator says.

A failed attempt (`/?strava=failed`) is remembered in the browser
(`openradlr.strava-connect`), so that rider is shown the file first next time.
It is forgotten when the account connects.

## What the client hands to Strava

- `POST /api/strava/upload?name=<name>` to the game's own server, with the
  session cookie; the body is the FIT file, `content-type: application/vnd.ant.fit`.
- `<name>` is `GOCARMO Ride · <route name>`; for an event
  `GOCARMO Ride race · <route>` or `GOCARMO Ride group ride · <route>`; for a
  class `GOCARMO Ride · Spin Studio · <class>`.
- The FIT file: sport cycling, sub-sport virtual activity (indoor cycling for
  a class), manufacturer 255 ("development"), product 1; one record a second
  with position, altitude, distance, speed, power, cadence and heart rate
  where recorded; laps from the splits. It carries no product name.
- Positions are in the virtual world at 39.0° N, 2.6° E (38.0° N, 2.6° E for
  Lanzarote Lava 180), as upstream defines them. The origin is not moved.
- The client sends no description. The server adds its own, its file name and
  its `external_id`; those are the server's strings.
- Downloads: `gocarmo-ride-<date>-<time>-<route>.fit|tcx|gpx`; TCX
  `<Creator><Name>GOCARMO Ride</Name>`, GPX `creator="GOCARMO Ride"`.

A file uploaded by hand has no name from the game: Strava names the activity
itself, and the rider can rename it.

## Strava's rules, as the client keeps them

`client/test/stravaRules.test.js` checks each of these.

- **Connecting is Strava's own button**, unmodified, 237 × 48 px, in
  `client/public/strava/` (see the note there). It is the only third-party
  mark in the game, and it is there because Strava provides it for this and
  asks to see it when it reviews an application. It links to the server's
  `/auth/strava`, which redirects to `https://www.strava.com/oauth/authorize`.
- **No other part of Strava's logo.** Upstream drew Strava's chevron next to
  its Strava lines and coloured its own buttons in Strava's orange; both are
  gone. The game's buttons are the game's.
- **"View on Strava"** is the text of every link to something on Strava
  (`strava.view`; "Ver no Strava", "Auf Strava ansehen"), bold and underlined.
  The guidelines give the English wording only. If Strava asks for it in
  English everywhere, change the two translations.
- **The name Strava** is plain text in sentences that say what the game does,
  never larger than the text around it, never part of the game's name.
- **What Strava says about an account is shown to that rider only** (API
  Policy 2.3 and 5.13). Upstream filled an empty rider name from the Strava
  account, and a rider's name is seen by everyone on the road. The fork does
  not do that.
- **Nothing on the ride image is Strava's.**

## For whoever runs the server

At <https://www.strava.com/settings/api>, with the owner's own Strava account
(a subscription is required):

1. **Application name:** `GOCARMO Ride`. Not a name with "Strava" in it.
2. **Website:** `https://gocarmo.com/ride/`.
3. **Authorization Callback Domain:** `ride.gocarmo.com` (the host only).
4. **Icon:** the game's own (`client/public/brand/icon-512.png`). No Strava mark.
5. **Description:** what it does, in plain words, e.g. "Indoor cycling in the
   browser. Uploads the rides you choose to your Strava account."
6. The client id and the client secret go into the host's secrets
   (`OPENRADLR_STRAVA_CLIENT_ID`, `OPENRADLR_STRAVA_CLIENT_SECRET`), with
   `OPENRADLR_PUBLIC_URL=https://ride.gocarmo.com`. Never into the repository.
7. Connect once from the game and upload one ride. Check the activity on Strava.
8. **Capacity:** in the same settings page, upgrade from one athlete to ten.
   For more, send Strava's developer programme form
   (<https://share.hsforms.com/1VXSwPUYqSH6IxK0y51FjHwcnkd8>) with screenshots
   of every place the game shows Strava data and of the "Connect with Strava"
   button: the start screen's Strava line, the finish dialog (connected, sent)
   and the saved ride on the start screen. Take them with the game in English.

What the rules ask beyond the client (not done by this change):

- **A privacy policy that meets the GDPR** (API Policy 7.3) and consent that
  says which data, how it is collected and how to withdraw and delete it
  (2.1). The game's privacy text is a plain notice; it has to be completed
  before more than the owner connects.
- **Deletion when a rider withdraws access** (API Policy 7.4), which Strava
  expects an application to learn through a webhook. The server has none; it
  forgets a login when Strava refuses its tokens, on "Disconnect", and on
  every restart without a data directory.
- **No announcement that names Strava** without Strava's consent (API Policy
  4.6). Where the site describes the feature, the wording is "Compatible with
  Strava" (guidelines, section 4), in plain text or with Strava's own API logo.
- Requests: about five per uploaded ride against a default limit of 200 per
  15 minutes and 2000 a day.
