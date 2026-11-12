// GOCARMO Ride (/ride/): where the game is served. This line is the only place that names the host.
// The page's script reads it here; node scripts/stamp.mjs writes it into ride/index.html (the plain links marked
// data-ride, and frame-src and connect-src of the Content-Security-Policy). To move the game to another host, change
// this line and run node scripts/stamp.mjs. An https:// origin: no path, no slash at the end. Keep it on one line.
export const RIDE_ORIGIN = 'https://ride.gocarmo.com';
