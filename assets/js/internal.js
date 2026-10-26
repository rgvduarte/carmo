// Imported by the admin pages. Opening /admin/ or /admin/strava/ marks this browser as the owner's, and analytics.js
// then never loads Google Analytics in it: his own visits are not counted, and Google's script never runs in the
// browser where the GitHub token can be kept. Clearing the site's data in the browser removes the mark.
try { localStorage.setItem('gc.internal', '1'); } catch (_) {}
