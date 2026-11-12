//! HTTP routes.
//!
//! | Route              | Purpose                                              |
//! |--------------------|------------------------------------------------------|
//! | `/healthz`         | Liveness probe for Docker and load balancers         |
//! | `/api/info`        | Server name, version, players, the routes to pick    |
//! | `/api/route?id=…`  | A full route file (the default route without `id`)   |
//! | `/api/map?id=…`    | A shared map's road network file, unchanged          |
//! | `/api/studio`      | Spin studio classes and the upcoming timetable       |
//! | `/ws`              | WebSocket game protocol                              |
//! | `/auth/*`, `/api/me`, `/api/strava/*` | Strava account and uploads (see [`crate::auth`]) |
//! | `/*`               | Browser client (only if a static dir is set)         |
//!
//! The four `/api/info`, `/api/route`, `/api/map` and `/api/studio` routes are
//! the public JSON API: pages on `OPENRADLR_ALLOWED_ORIGINS` may read them
//! from another origin (CORS, without credentials).

use crate::afk::{AfkCounts, AfkStats};
use crate::app::unix_now_s;
use crate::auth::{self, Strava};
use crate::connection;
use crate::guard::{client_ip, ip_bucket, origin_allowed, platform_client_ip, same_secret, ConnectionLimits, Slots};
use crate::map_file::Maps;
use crate::protocol::{DeviceKind, EventInfoWire, PROTOCOL_VERSION};
use crate::route_file::RouteFile;
use crate::stats::DistanceStats;
use crate::studio::{STUDIO_ID, STUDIO_NAME};
use crate::worlds::{StudioEntry, WorldEntry, Worlds};
use crate::ServerInfo;
use axum::extract::connect_info::ConnectInfo;
use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{DefaultBodyLimit, Query, State};
use axum::http::{header, Extensions, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use openradlr_sim::studio::{ClassPlan, Timetable, LOBBY_S, SEATS_PER_ROOM, SLOT_S};
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::set_header::{SetResponseHeader, SetResponseHeaderLayer};
use tower_http::trace::TraceLayer;

/// Largest WebSocket message a client may send.
const MAX_MESSAGE_BYTES: usize = 16 * 1024;
/// Largest ride file for uploads (a 4-hour ride is about 3 MB of TCX).
const MAX_UPLOAD_BYTES: usize = 16 * 1024 * 1024;

/// Shared limits that protect the server from floods and scripts.
pub struct Protection {
    /// One seat per joined rider, across all worlds (`OPENRADLR_MAX_PLAYERS`).
    pub seats: Slots<()>,
    /// The same for riders on phone paddles (`OPENRADLR_MAX_PADDLE_PLAYERS`): they never take a trainer rider's seat.
    pub paddle_seats: Slots<()>,
    /// Open WebSocket connections per client address (an IPv6 address counts
    /// by its /64 network, see [`ip_bucket`]).
    pub per_ip: Slots<IpAddr>,
    /// Open WebSocket connections in all (`OPENRADLR_MAX_CONNECTIONS`): many
    /// addresses together cannot open more than this.
    pub connections: Slots<()>,
    /// Set once the platform's client address header was missing on an
    /// upgrade, so the warning is logged once, not for every rider.
    pub ip_header_missing_logged: AtomicBool,
    pub trust_proxy: bool,
    /// The header in which a hosting platform's proxy reports the client's
    /// address (`OPENRADLR_CLIENT_IP_HEADER`); `None`: no header is believed.
    pub client_ip_header: Option<header::HeaderName>,
    /// The bearer token `/internal/metrics` asks for (`OPENRADLR_METRICS_TOKEN`);
    /// `None`: only this machine itself may read the metrics.
    pub metrics_token: Option<String>,
    pub allowed_origins: Vec<String>,
    pub limits: ConnectionLimits,
}

impl Protection {
    /// The seat pool a rider on this device takes from.
    pub fn seats_for(&self, device: DeviceKind) -> &Slots<()> {
        match device {
            DeviceKind::Paddle => &self.paddle_seats,
            _ => &self.seats,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub worlds: Arc<Worlds>,
    /// Road network files by map id (ADR 0010).
    pub maps: Arc<Maps>,
    pub info: Arc<ServerInfo>,
    /// Seats for trainer riders; phone riders have `max_paddle_players` of their own.
    pub max_players: usize,
    pub max_paddle_players: usize,
    pub protection: Arc<Protection>,
    /// `None` when the server has no Strava API app configured.
    pub strava: Option<Arc<Strava>>,
    pub allow_simulated_trainer: bool,
    pub allow_paddle_mode: bool,
    /// Community distance totals (#65).
    pub stats: DistanceStats,
    /// AFK warning counters, shared by all connections.
    pub afk: AfkStats,
}

#[derive(Debug, Serialize)]
pub struct InfoResponse {
    pub name: String,
    pub version: String,
    /// Git commit and date of this server's build, so a client can tell it is out of date.
    pub build: crate::BuildInfo,
    pub protocol_version: u32,
    pub auth_mode: String,
    pub players: usize,
    /// Of those, the riders on phone paddles (not in the studio).
    pub phone_players: usize,
    /// Seats for trainer (and simulated) riders.
    pub max_players: usize,
    /// Seats for riders on phone paddles, apart from `max_players`.
    pub max_phone_players: usize,
    /// The default route (kept for older clients).
    pub route: RouteSummary,
    pub routes: Vec<RouteSummary>,
    pub strava: StravaInfo,
    /// Server clock (Unix seconds), to read `events` against.
    pub now_s: f64,
    /// Scheduled events of all worlds, soonest start first.
    pub events: Vec<EventInfoWire>,
    /// The spin studio, if this server hosts one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub studio: Option<StudioSummary>,
    /// Whether the start screen offers the simulated trainer. Only a UI
    /// switch: a script can always send made-up power.
    pub simulated_trainer: bool,
    /// Whether riders may join with phone paddles (tapping for power).
    pub paddle_mode: bool,
    /// Analytics script the client loads; absent unless the operator enabled it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub analytics: Option<crate::config::Analytics>,
    /// The operator's privacy policy; absent unless set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub privacy_url: Option<String>,
    /// Metres ridden on this server since the counters began, by device (#65).
    /// The device is the client's own claim, so this is a vanity counter.
    pub distance_m: DistanceInfo,
}

#[derive(Debug, Serialize)]
pub struct DistanceInfo {
    pub trainer: f64,
    pub paddle: f64,
}

#[derive(Debug, Serialize)]
pub struct StravaInfo {
    pub enabled: bool,
    /// Joining needs a connected Strava account.
    pub required: bool,
    /// Strava still limits how many athletes may connect to this server's API
    /// application (`OPENRADLR_STRAVA_LIMITED`). The client then offers the
    /// ride file first. Always true while Strava is off.
    pub limited: bool,
    /// Only the Strava application's owner can connect yet
    /// (`OPENRADLR_STRAVA_LIMITED=owner`): the client shows no "Connect with
    /// Strava" button, and everyone gets the ride file.
    pub owner_only: bool,
}

#[derive(Debug, Serialize)]
pub struct RouteSummary {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub length_m: f64,
    pub elevation_gain_m: f64,
    pub players: usize,
    /// Of those, the riders on phone paddles.
    pub phone_players: usize,
    /// Riders of other apps ride this route too (OpenBikeNet is connected); absent otherwise.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub shared: bool,
}

impl RouteSummary {
    fn of(entry: &WorldEntry) -> Self {
        Self {
            id: entry.file.id.clone(),
            name: entry.file.name.clone(),
            description: entry.file.description.clone(),
            length_m: entry.length_m.round(),
            elevation_gain_m: entry.elevation_gain_m.round(),
            players: entry.game.players_on(&entry.file.id),
            phone_players: entry.game.phones_on(&entry.file.id),
            shared: entry.shared,
        }
    }
}

/// A class in the timetable.
#[derive(Debug, Serialize)]
pub struct SlotSummary {
    pub class_id: String,
    pub name: String,
    /// Unix time in seconds when the class starts (the lobby opens 5 min earlier).
    pub starts_at_s: f64,
}

impl SlotSummary {
    /// The class of the slot that is `ahead` slots after the one at `now_s`.
    fn at(timetable: &Timetable, now_s: f64, ahead: u32) -> Self {
        let clock = timetable.at(now_s + f64::from(ahead * SLOT_S));
        let class = timetable.class(&clock);
        Self {
            class_id: class.id.clone(),
            name: class.name.clone(),
            starts_at_s: clock.starts_at_s,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct StudioSummary {
    pub id: &'static str,
    pub name: &'static str,
    pub players: usize,
    /// The class of the current slot (in its lobby while `starts_at_s` lies ahead).
    pub class: SlotSummary,
    pub next: SlotSummary,
}

impl StudioSummary {
    fn of(entry: &StudioEntry, now_s: f64) -> Self {
        Self {
            id: STUDIO_ID,
            name: STUDIO_NAME,
            players: entry.game.player_count(),
            class: SlotSummary::at(&entry.timetable, now_s, 0),
            next: SlotSummary::at(&entry.timetable, now_s, 1),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct SegmentInfo {
    pub duration_s: u32,
    /// Power as a fraction of FTP, ramping from `from` to `to`.
    pub from: f64,
    pub to: f64,
    /// Cadence range in rpm the instructor asks for.
    pub cadence: Option<[u32; 2]>,
    pub cue: String,
}

#[derive(Debug, Serialize)]
pub struct ClassInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub duration_s: u32,
    pub segments: Vec<SegmentInfo>,
}

impl ClassInfo {
    fn of(class: &ClassPlan) -> Self {
        Self {
            id: class.id.clone(),
            name: class.name.clone(),
            description: class.description.clone(),
            duration_s: class.duration_s(),
            segments: class
                .segments
                .iter()
                .map(|s| SegmentInfo {
                    duration_s: s.duration_s,
                    from: s.from,
                    to: s.to,
                    cadence: s.cadence.map(|(lo, hi)| [lo, hi]),
                    cue: s.cue.clone(),
                })
                .collect(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct StudioResponse {
    pub id: &'static str,
    pub name: &'static str,
    pub slot_s: u32,
    pub lobby_s: u32,
    pub seats_per_room: usize,
    pub classes: Vec<ClassInfo>,
    /// The current slot and the next few.
    pub schedule: Vec<SlotSummary>,
}

#[derive(Debug, Deserialize)]
pub struct RouteQuery {
    pub id: Option<String>,
}

/// Lets pages on the allowed origins read the public JSON API from another
/// origin, e.g. a club site that shows who is riding: the request's `Origin`
/// is echoed when it is on the list (exact match), preflights are answered,
/// and credentials are never allowed, so the Strava routes stay same-origin.
/// `None` without an allow-list: no CORS headers at all.
fn public_api_cors(allowed_origins: &[String]) -> Option<CorsLayer> {
    let origins: Vec<HeaderValue> = allowed_origins
        .iter()
        .filter_map(|origin| HeaderValue::from_str(origin).ok())
        .collect();
    (!origins.is_empty()).then(|| {
        CorsLayer::new()
            .allow_origin(AllowOrigin::list(origins))
            .allow_methods([Method::GET])
            .max_age(Duration::from_secs(600))
    })
}

/// `headers` (see [`crate::headers`]) go on every response that doesn't set them itself.
pub fn router(state: AppState, static_dir: Option<&Path>, headers: &[(header::HeaderName, String)]) -> Router {
    // What any visitor may read: only these routes answer cross-origin requests.
    let public_api = Router::new()
        .route("/api/info", get(info))
        .route("/api/route", get(route))
        .route("/api/map", get(map))
        .route("/api/studio", get(studio));
    let public_api = match public_api_cors(&state.protection.allowed_origins) {
        Some(cors) => public_api.layer(cors),
        None => public_api,
    };
    let router = Router::new()
        .route("/healthz", get(healthz))
        .route("/internal/metrics", get(metrics))
        .merge(public_api)
        .route("/ws", get(websocket))
        .route("/auth/strava", get(auth::login))
        .route("/auth/strava/callback", get(auth::callback))
        .route("/auth/strava/app", post(auth::app_login))
        .route("/auth/strava/app/claim", post(auth::app_claim))
        .route("/auth/logout", post(auth::logout))
        .route(
            "/auth/strava/webhook/{token}",
            get(auth::webhook_check).post(auth::webhook_event),
        )
        .route("/api/me", get(auth::me))
        .route(
            "/api/strava/upload",
            post(auth::upload).layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES)),
        )
        .route("/api/strava/upload/{id}", get(auth::upload_status))
        .with_state(state);

    let router = match static_dir {
        // Revalidate on every load (cheap: 304 when unchanged), so a deploy never
        // pairs new HTML with a stylesheet the browser cached heuristically.
        // A file with a `.gz` copy next to it (the Docker image writes them at
        // build time) is sent as that copy to a browser that takes gzip: no
        // compressing on every first visit, which costs about 0.2 s of a full
        // core for the whole client, two seconds on a 0.1-CPU host. The
        // compression layer below leaves an answer that is already encoded alone.
        Some(dir) => router.fallback_service(SetResponseHeader::overriding(
            ServeDir::new(dir).precompressed_gzip(),
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-cache"),
        )),
        None => router,
    };
    let router = headers.iter().fold(router, |router, (name, value)| {
        let value = HeaderValue::from_str(value).expect("security headers are plain ASCII");
        router.layer(SetResponseHeaderLayer::if_not_present(name.clone(), value))
    });
    // Brotli or gzip, whichever the browser accepts: the client and the route data shrink to
    // about a quarter. Not-modified answers and the WebSocket upgrade have no body to compress.
    router
        .layer(CompressionLayer::new().br(true).gzip(true))
        .layer(TraceLayer::new_for_http())
}

async fn healthz() -> &'static str {
    "ok"
}

/// Who asks for `/internal/metrics`, as far as the server can tell.
#[derive(Debug, PartialEq, Eq)]
enum MetricsAccess {
    Allowed,
    /// A token is configured and the request did not bring it.
    Unauthorized,
    /// No token is configured and the request is not from this machine.
    Hidden,
}

/// With a token (`OPENRADLR_METRICS_TOKEN`) the request needs
/// `Authorization: Bearer <token>`, wherever it comes from. Without one only
/// this machine itself is answered: a loopback peer whose request no proxy
/// forwarded (a reverse proxy on the same machine is a loopback peer too, and
/// marks what it passes on). `forwarding_header` is the platform's header
/// (`OPENRADLR_CLIENT_IP_HEADER`), if one is configured.
fn metrics_access(
    token: Option<&str>,
    headers: &HeaderMap,
    peer: Option<SocketAddr>,
    forwarding_header: Option<&header::HeaderName>,
) -> MetricsAccess {
    if let Some(token) = token {
        let mut presented = headers
            .get_all(header::AUTHORIZATION)
            .iter()
            .map(|value| value.to_str().unwrap_or(""));
        let authorised = match (presented.next(), presented.next()) {
            (Some(value), None) => value
                .split_once(' ')
                .is_some_and(|(scheme, given)| scheme.eq_ignore_ascii_case("bearer") && same_secret(given, token)),
            _ => false,
        };
        return if authorised {
            MetricsAccess::Allowed
        } else {
            MetricsAccess::Unauthorized
        };
    }
    let local = peer.is_some_and(|addr| addr.ip().to_canonical().is_loopback());
    let forwarded = ["x-forwarded-for", "forwarded", "x-real-ip"]
        .into_iter()
        .any(|name| headers.contains_key(name))
        || forwarding_header.is_some_and(|name| headers.contains_key(name));
    if local && !forwarded {
        MetricsAccess::Allowed
    } else {
        MetricsAccess::Hidden
    }
}

// This endpoint is intended for the host's private Prometheus network. It only
// exports aggregate counters already exposed by /api/info; never rider data,
// names, IDs, credentials, or request details. It is still not for everyone:
// see [`metrics_access`].
async fn metrics(State(state): State<AppState>, headers: HeaderMap, extensions: Extensions) -> Response {
    let peer = extensions.get::<ConnectInfo<SocketAddr>>().map(|info| info.0);
    let protection = &state.protection;
    match metrics_access(
        protection.metrics_token.as_deref(),
        &headers,
        peer,
        protection.client_ip_header.as_ref(),
    ) {
        MetricsAccess::Allowed => {}
        MetricsAccess::Unauthorized => {
            return (StatusCode::UNAUTHORIZED, [(header::WWW_AUTHENTICATE, "Bearer")]).into_response();
        }
        MetricsAccess::Hidden => return StatusCode::NOT_FOUND.into_response(),
    }
    let distance = state.stats.snapshot();
    let body = metrics_body(
        state.worlds.player_count(),
        state.worlds.phone_count(),
        state.max_players,
        state.max_paddle_players,
        distance.trainer_m,
        distance.paddle_m,
        state.afk.snapshot(),
    );
    (
        [(header::CONTENT_TYPE, "text/plain; version=0.0.4; charset=utf-8")],
        body,
    )
        .into_response()
}

fn metrics_body(
    players: usize,
    phone_players: usize,
    player_capacity: usize,
    phone_capacity: usize,
    trainer_m: f64,
    paddle_m: f64,
    afk: AfkCounts,
) -> String {
    format!(
        "# HELP openradlr_players Current connected riders, including bots.\n# TYPE openradlr_players gauge\nopenradlr_players {}\n\
         # HELP openradlr_phone_players Current riders using phone paddles.\n# TYPE openradlr_phone_players gauge\nopenradlr_phone_players {}\n\
         # HELP openradlr_player_capacity Configured capacity for trainer riders.\n# TYPE openradlr_player_capacity gauge\nopenradlr_player_capacity {}\n\
         # HELP openradlr_phone_player_capacity Configured capacity for phone riders.\n# TYPE openradlr_phone_player_capacity gauge\nopenradlr_phone_player_capacity {}\n\
         # HELP openradlr_distance_metres_total Community distance recorded by device.\n# TYPE openradlr_distance_metres_total counter\nopenradlr_distance_metres_total{{device=\"trainer\"}} {}\nopenradlr_distance_metres_total{{device=\"paddle\"}} {}\n\
         # HELP openradlr_afk_events_total AFK warnings and their outcomes since the server started.\n# TYPE openradlr_afk_events_total counter\n\
         openradlr_afk_events_total{{event=\"warning\"}} {}\nopenradlr_afk_events_total{{event=\"stayed\"}} {}\nopenradlr_afk_events_total{{event=\"left\"}} {}\nopenradlr_afk_events_total{{event=\"timeout\"}} {}\n\
         ",
        players,
        phone_players,
        player_capacity,
        phone_capacity,
        trainer_m,
        paddle_m,
        afk.warning,
        afk.stayed,
        afk.left,
        afk.timeout,
    )
}

#[cfg(test)]
mod metrics_tests {
    use super::{metrics_access, metrics_body, MetricsAccess};
    use crate::afk::AfkCounts;
    use axum::http::{header, HeaderMap, HeaderName, HeaderValue};
    use std::net::SocketAddr;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef";

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.append(HeaderName::from_static(name), HeaderValue::from_str(value).unwrap());
        }
        map
    }

    fn peer(addr: &str) -> Option<SocketAddr> {
        Some(addr.parse().unwrap())
    }

    #[test]
    fn without_a_token_only_this_machine_reads_the_metrics() {
        let none = HeaderMap::new();
        for local in [
            "127.0.0.1:4000",
            "127.8.9.1:4000",
            "[::1]:4000",
            "[::ffff:127.0.0.1]:4000",
        ] {
            assert_eq!(
                metrics_access(None, &none, peer(local), None),
                MetricsAccess::Allowed,
                "{local}"
            );
        }
        for remote in [
            "203.0.113.9:4000",
            "10.0.0.5:4000",
            "172.17.0.1:4000",
            "192.168.1.20:4000",
            "[2001:db8::1]:4000",
            "[fd00::2]:4000",
            "0.0.0.0:4000",
        ] {
            assert_eq!(
                metrics_access(None, &none, peer(remote), None),
                MetricsAccess::Hidden,
                "{remote}"
            );
        }
        // No peer address at all: nothing proves the request is local.
        assert_eq!(metrics_access(None, &none, None, None), MetricsAccess::Hidden);
        // A bearer token means nothing while none is configured.
        let bearer = headers(&[("authorization", "Bearer 0123456789abcdef0123456789abcdef")]);
        assert_eq!(
            metrics_access(None, &bearer, peer("203.0.113.9:4000"), None),
            MetricsAccess::Hidden
        );
    }

    #[test]
    fn without_a_token_requests_through_a_proxy_on_this_machine_are_not_local() {
        let local = peer("127.0.0.1:4000");
        for name in ["x-forwarded-for", "forwarded", "x-real-ip"] {
            let forwarded = headers(&[(name, "203.0.113.9")]);
            assert_eq!(
                metrics_access(None, &forwarded, local, None),
                MetricsAccess::Hidden,
                "{name}"
            );
        }
        let platform = HeaderName::from_static("fly-client-ip");
        let forwarded = headers(&[("fly-client-ip", "203.0.113.9")]);
        assert_eq!(
            metrics_access(None, &forwarded, local, Some(&platform)),
            MetricsAccess::Hidden
        );
        // Not configured, the same header is just a header.
        assert_eq!(metrics_access(None, &forwarded, local, None), MetricsAccess::Allowed);
    }

    #[test]
    fn with_a_token_the_request_must_bring_it() {
        let remote = peer("203.0.113.9:4000");
        let with = |value: &str| headers(&[("authorization", value)]);
        for good in [
            format!("Bearer {TOKEN}"),
            format!("bearer {TOKEN}"),
            format!("BEARER {TOKEN}"),
        ] {
            assert_eq!(
                metrics_access(Some(TOKEN), &with(&good), remote, None),
                MetricsAccess::Allowed,
                "{good}"
            );
        }
        for bad in [
            TOKEN.to_owned(),
            format!("Bearer {TOKEN}x"),
            format!("Bearer {}", &TOKEN[..31]),
            format!("Bearer  {TOKEN}"),
            format!("Bearer {TOKEN} "),
            format!("Basic {TOKEN}"),
            "Bearer".to_owned(),
            "Bearer ".to_owned(),
            String::new(),
        ] {
            assert_eq!(
                metrics_access(Some(TOKEN), &with(&bad), remote, None),
                MetricsAccess::Unauthorized,
                "{bad:?}"
            );
        }
        // No header, or two of them.
        assert_eq!(
            metrics_access(Some(TOKEN), &HeaderMap::new(), remote, None),
            MetricsAccess::Unauthorized
        );
        let good = format!("Bearer {TOKEN}");
        let twice = headers(&[("authorization", "Bearer wrong"), ("authorization", &good)]);
        assert_eq!(
            metrics_access(Some(TOKEN), &twice, remote, None),
            MetricsAccess::Unauthorized
        );
        // With a token, being on this machine is not enough any more.
        assert_eq!(
            metrics_access(Some(TOKEN), &HeaderMap::new(), peer("127.0.0.1:4000"), None),
            MetricsAccess::Unauthorized
        );
        // And the token works through any proxy.
        let mut forwarded = with(&good);
        forwarded.insert(header::FORWARDED, HeaderValue::from_static("for=203.0.113.9"));
        assert_eq!(
            metrics_access(Some(TOKEN), &forwarded, remote, None),
            MetricsAccess::Allowed
        );
    }

    #[test]
    fn metrics_export_only_aggregate_operational_stats() {
        let afk = AfkCounts {
            warning: 3,
            stayed: 2,
            left: 1,
            timeout: 0,
        };
        let output = metrics_body(4, 1, 50, 20, 12_500.0, 750.0, afk);

        assert!(output.contains("openradlr_players 4\n"));
        assert!(output.contains("openradlr_phone_players 1\n"));
        assert!(output.contains("openradlr_distance_metres_total{device=\"trainer\"} 12500\n"));
        assert!(output.contains("openradlr_distance_metres_total{device=\"paddle\"} 750\n"));
        assert!(output.contains("# TYPE openradlr_afk_events_total counter\n"));
        assert!(output.contains("openradlr_afk_events_total{event=\"warning\"} 3\n"));
        assert!(output.contains("openradlr_afk_events_total{event=\"stayed\"} 2\n"));
        assert!(output.contains("openradlr_afk_events_total{event=\"left\"} 1\n"));
        assert!(output.contains("openradlr_afk_events_total{event=\"timeout\"} 0\n"));
        assert!(!output.contains("name="));
        assert!(!output.contains("token"));
    }
}

async fn info(State(state): State<AppState>) -> Json<InfoResponse> {
    let now_s = unix_now_s();
    let mut events: Vec<EventInfoWire> = state
        .worlds
        .games()
        .into_iter()
        .flat_map(|game| game.events())
        .collect();
    events.sort_by(|a, b| a.starts_at_s.total_cmp(&b.starts_at_s));
    Json(InfoResponse {
        name: state.info.name.clone(),
        version: state.info.version.clone(),
        build: state.info.build.clone(),
        protocol_version: PROTOCOL_VERSION,
        auth_mode: state.info.auth_mode.clone(),
        players: state.worlds.player_count(),
        phone_players: state.worlds.phone_count(),
        max_players: state.max_players,
        max_phone_players: state.max_paddle_players,
        route: RouteSummary::of(state.worlds.default_world()),
        routes: state.worlds.iter().map(RouteSummary::of).collect(),
        strava: StravaInfo {
            enabled: state.strava.is_some(),
            required: state.strava.as_ref().is_some_and(|s| s.required),
            limited: state.strava.as_ref().is_none_or(|s| s.config.limited),
            owner_only: state.strava.as_ref().is_some_and(|s| s.config.owner_only),
        },
        now_s,
        events,
        studio: state.worlds.studio().map(|entry| StudioSummary::of(entry, now_s)),
        simulated_trainer: state.allow_simulated_trainer,
        paddle_mode: state.allow_paddle_mode,
        analytics: state.info.analytics.clone(),
        privacy_url: state.info.privacy_url.clone(),
        distance_m: {
            let totals = state.stats.snapshot();
            // Whole metres: the exact fraction is noise.
            DistanceInfo {
                trainer: totals.trainer_m.round(),
                paddle: totals.paddle_m.round(),
            }
        },
    })
}

async fn studio(State(state): State<AppState>) -> Result<Json<StudioResponse>, StatusCode> {
    let entry = state.worlds.studio().ok_or(StatusCode::NOT_FOUND)?;
    let now_s = unix_now_s();
    Ok(Json(StudioResponse {
        id: STUDIO_ID,
        name: STUDIO_NAME,
        slot_s: SLOT_S,
        lobby_s: LOBBY_S,
        seats_per_room: SEATS_PER_ROOM,
        classes: entry.timetable.classes().iter().map(ClassInfo::of).collect(),
        schedule: (0..6)
            .map(|ahead| SlotSummary::at(&entry.timetable, now_s, ahead))
            .collect(),
    }))
}

async fn route(State(state): State<AppState>, Query(query): Query<RouteQuery>) -> Result<Json<RouteFile>, StatusCode> {
    let entry = state.worlds.get(query.id.as_deref()).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json((*entry.file).clone()))
}

#[derive(Debug, Deserialize)]
pub struct MapQuery {
    pub id: String,
}

async fn map(State(state): State<AppState>, Query(query): Query<MapQuery>) -> Result<Response, StatusCode> {
    let json = state.maps.get(&query.id).ok_or(StatusCode::NOT_FOUND)?;
    Ok(([(header::CONTENT_TYPE, "application/json")], json.to_string()).into_response())
}

async fn websocket(
    upgrade: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
    extensions: Extensions,
) -> Response {
    let protection = Arc::clone(&state.protection);
    let origin = headers.get(header::ORIGIN).and_then(|value| value.to_str().ok());
    if !origin_allowed(origin, &protection.allowed_origins) {
        tracing::warn!(
            origin = origin.unwrap_or("-"),
            "websocket from a foreign origin rejected"
        );
        return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }

    // Every open socket costs memory: past this many in all, nobody new gets one.
    let Some(connection_permit) = protection.connections.try_acquire(()) else {
        tracing::warn!(limit = protection.connections.limit(), "too many open connections");
        return (StatusCode::SERVICE_UNAVAILABLE, "the server is full, try again later").into_response();
    };

    // Without connection info (e.g. in tests) or a usable address, no per-IP limit applies.
    let peer = extensions.get::<ConnectInfo<SocketAddr>>().map(|info| info.0);
    let forwarded_for = headers.get("x-forwarded-for").and_then(|value| value.to_str().ok());
    // A platform proxy's own header wins over X-Forwarded-For; without a usable
    // value the request is treated as if the header were not configured.
    let platform_ip = protection
        .client_ip_header
        .as_ref()
        .and_then(|name| platform_client_ip(headers.get_all(name).iter().map(|value| value.to_str().unwrap_or(""))));
    if let Some(name) = &protection.client_ip_header {
        if platform_ip.is_none() && !protection.ip_header_missing_logged.swap(true, Ordering::Relaxed) {
            tracing::warn!(
                header = %name,
                "OPENRADLR_CLIENT_IP_HEADER is set but this upgrade request did not carry it: the limit per address \
                 counts the proxy's address instead (logged once)"
            );
        }
    }
    let ip_permit = match platform_ip
        .or_else(|| client_ip(peer, forwarded_for, protection.trust_proxy))
        .map(ip_bucket)
    {
        Some(ip) => match protection.per_ip.try_acquire(ip) {
            Some(permit) => Some(permit),
            None => {
                tracing::warn!(%ip, "too many connections from one address");
                return (StatusCode::TOO_MANY_REQUESTS, "too many connections from your address").into_response();
            }
        },
        None => None,
    };

    // Strava as the account: one connection per athlete.
    let mut athlete_permit = None;
    if let Some(strava) = state.strava.as_deref().filter(|s| s.required) {
        let Some((_, account)) = strava.account(&headers) else {
            return (StatusCode::UNAUTHORIZED, "connect your Strava account first").into_response();
        };
        match strava.riders.try_acquire(account.athlete_id) {
            Some(permit) => athlete_permit = Some(permit),
            None => return (StatusCode::CONFLICT, "this Strava account is already riding").into_response(),
        }
    }

    upgrade
        .max_message_size(MAX_MESSAGE_BYTES)
        // A frame is read whole before the message limit is checked: cap the
        // frame too, so a client cannot make the server buffer megabytes.
        .max_frame_size(MAX_MESSAGE_BYTES)
        // tungstenite reads in 128 KiB chunks by default, per connection; the
        // game's messages are a few hundred bytes.
        .read_buffer_size(4 * 1024)
        .write_buffer_size(0)
        .on_upgrade(move |socket| async move {
            connection::serve(socket, state).await;
            drop(ip_permit);
            drop(athlete_permit);
            drop(connection_permit);
        })
}
