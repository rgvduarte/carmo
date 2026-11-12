//! # openradlr-server
//!
//! Network adapter around the `openradlr-sim` core. Layers, from the outside in:
//!
//! * [`http`] — axum router: health check, info, routes, WebSocket, static client
//! * [`connection`] — drives one WebSocket with a [`session::Session`]
//! * [`session`] — per-connection protocol state machine and limits
//! * [`afk`] — notices riders who stopped pedalling and warns them
//! * [`guard`] — rate limits, connection caps, client IPs behind a proxy
//! * [`worlds`] — one world (and game loop) per route, plus the spin studio
//! * [`map_file`] — road network files of shared maps, served to clients
//! * [`auth`], [`strava`], [`strava_api`] — optional Strava account and uploads
//! * [`stats`] — community distance counters, kept across restarts
//! * [`runtime`] — async game loop task and its command channel
//! * [`game`] — synchronous game core: clients, broadcasts, resistance
//! * [`studio`] — the spin studio's game core: rooms, class state
//! * [`vehicle_codes`] — registry of boarding codes across worlds
//! * [`protocol`] — JSON message types and mapping from the simulation
//!
//! [`app::build`] composes everything; it is the composition root used by
//! `main.rs` and by the integration tests.

pub mod afk;
pub mod app;
pub mod auth;
pub mod config;
pub mod connection;
pub mod events_file;
pub mod game;
pub mod guard;
pub mod headers;
pub mod healthcheck;
pub mod http;
pub mod map_file;
pub mod obn;
pub mod players;
pub mod protocol;
pub mod resume;
pub mod route_file;
pub mod runtime;
pub mod secure_random;
pub mod session;
pub mod session_store;
pub mod stats;
pub mod strava;
pub mod strava_api;
pub mod studio;
pub mod vehicle_codes;
pub mod worlds;

/// The name this server gives itself to riders and to the services it talks
/// to (Strava, an OpenBikeNet server). This is GOCARMO Ride, a modified version
/// of OpenRadlr: nobody outside may take it for OpenRadlr itself. Internal
/// names (the `OPENRADLR_` settings, the crates, cookies and files) stay.
pub const APP_NAME: &str = "GOCARMO Ride";

/// The public page of this fork, for those who want to know who is calling.
pub const APP_URL: &str = "https://gocarmo.com/ride/";

/// The `User-Agent` of the server's own HTTP requests (to Strava).
pub fn user_agent() -> String {
    format!("GOCARMO-Ride/{} (+{APP_URL})", env!("CARGO_PKG_VERSION"))
}

/// Which build is running: set by the Docker build (`OPENRADLR_BUILD_SHA`, `OPENRADLR_BUILD_DATE`).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct BuildInfo {
    pub sha: String,
    pub date: String,
}

impl BuildInfo {
    pub fn new(sha: Option<String>, date: Option<String>) -> Self {
        let clean = |v: Option<String>, fallback: &str| {
            v.map(|v| v.trim().to_owned())
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| fallback.to_owned())
        };
        Self {
            sha: clean(sha, "dev"),
            date: clean(date, ""),
        }
    }

    pub fn from_env() -> Self {
        Self::from_lookup(|key| std::env::var(key).ok())
    }

    /// `OPENRADLR_BUILD_SHA` (the Docker build writes it); when that is
    /// missing or `dev`, Render's own `RENDER_GIT_COMMIT`, which Render sets
    /// at run time on every deploy: the running commit is known even when the
    /// build did not get it as a build argument.
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Self {
        let given = lookup("OPENRADLR_BUILD_SHA").filter(|sha| !matches!(sha.trim(), "" | "dev"));
        Self::new(
            given.or_else(|| lookup("RENDER_GIT_COMMIT")),
            lookup("OPENRADLR_BUILD_DATE"),
        )
    }
}

/// Static facts about this server, shown to clients.
#[derive(Debug, Clone, PartialEq)]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
    /// Git commit and build date of this server (`dev` when built outside Docker).
    pub build: BuildInfo,
    pub auth_mode: String,
    /// The default route, joined when a client doesn't pick one.
    pub route_id: String,
    /// Riders may join with the simulated trainer / with phone paddles.
    pub allow_simulated_trainer: bool,
    pub allow_paddle_mode: bool,
    /// Analytics the client should load, if the operator set one up.
    pub analytics: Option<config::Analytics>,
    /// The operator's privacy policy, if they set one.
    pub privacy_url: Option<String>,
    /// Seconds a rider lingers after their socket dies before being removed.
    pub grace_s: f64,
}

#[cfg(test)]
mod tests {
    use super::BuildInfo;

    #[test]
    fn the_server_introduces_itself_as_the_fork() {
        let agent = super::user_agent();
        assert_eq!(
            agent,
            format!(
                "GOCARMO-Ride/{} (+https://gocarmo.com/ride/)",
                env!("CARGO_PKG_VERSION")
            )
        );
        // A product token has no spaces; the rest is a comment in brackets.
        assert!(!agent.split_once(' ').unwrap().0.contains("OpenRadlr"));
        assert!(agent.is_ascii());
        assert_eq!(super::APP_NAME, "GOCARMO Ride");
    }

    #[test]
    fn build_falls_back_to_dev() {
        let none = BuildInfo::new(None, None);
        assert_eq!((none.sha.as_str(), none.date.as_str()), ("dev", ""));
        let blank = BuildInfo::new(Some("  ".into()), None);
        assert_eq!(blank.sha, "dev");
        let set = BuildInfo::new(Some("3f2a9c1\n".into()), Some("2026-10-16T09:12Z".into()));
        assert_eq!((set.sha.as_str(), set.date.as_str()), ("3f2a9c1", "2026-10-16T09:12Z"));
    }

    #[test]
    fn render_s_commit_names_the_build_when_the_image_does_not() {
        let build = |pairs: &[(&str, &str)]| {
            BuildInfo::from_lookup(|key| pairs.iter().find(|(k, _)| *k == key).map(|(_, v)| (*v).to_owned())).sha
        };
        let render = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(
            build(&[("OPENRADLR_BUILD_SHA", "dev"), ("RENDER_GIT_COMMIT", render)]),
            render
        );
        assert_eq!(build(&[("RENDER_GIT_COMMIT", render)]), render);
        assert_eq!(
            build(&[("OPENRADLR_BUILD_SHA", "3f2a9c1"), ("RENDER_GIT_COMMIT", render)]),
            "3f2a9c1",
            "the image's own label wins"
        );
        assert_eq!(build(&[("OPENRADLR_BUILD_SHA", "dev")]), "dev");
        assert_eq!(build(&[]), "dev");
    }
}
