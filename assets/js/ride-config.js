// GOCARMO Ride: where the game is served. This line is the only place that names the host.
// The home page's script (ride.js, the status call) reads it here; node scripts/stamp.mjs writes it into every link to
// the game (<a data-ride>, on the home page, the public pages' footers and /ride/) and into the refresh meta of /ride/.
// To move the game to another host, change this line and run node scripts/stamp.mjs. An https:// origin: no path, no
// slash at the end. Keep it on one line.
export const RIDE_ORIGIN = 'https://ride.gocarmo.com';
