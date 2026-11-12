//! End-to-end tests of "Connect with Strava" and ride uploads, against a
//! stand-in for Strava: what the server sends there, what the browser gets
//! back, and what happens to logins when the server restarts.

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use openradlr_server::app;
use openradlr_server::config::{Config, EventsSetting};
use openradlr_server::strava::StravaConfig;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const ROUTES_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../routes");
const PUBLIC_URL: &str = "https://ride.example.org";
const SECRET_KEY: &str = "a-test-secret-key-of-32-characters";

/// What the stand-in Strava was asked, and how it answers next.
#[derive(Default)]
struct Strava {
    /// HTTP status for the next token refreshes (200 unless set).
    refresh_status: Option<u16>,
    /// HTTP status for uploads and upload status (200 unless set).
    upload_status: Option<u16>,
    refreshes: u32,
    token_forms: Vec<String>,
    /// Every request to the API: its headers and its body as text.
    requests: Vec<(String, HeaderMap, String)>,
}

type Fake = Arc<Mutex<Strava>>;

fn far_future() -> i64 {
    openradlr_server::auth::now_s() + 6 * 3600
}

async fn fake_token(State(fake): State<Fake>, headers: HeaderMap, body: String) -> (StatusCode, Json<Value>) {
    let mut fake = fake.lock().unwrap();
    fake.token_forms.push(body.clone());
    fake.requests.push(("token".into(), headers, body.clone()));
    if body.contains("grant_type=authorization_code") {
        if !body.contains("code=good-code") {
            return (StatusCode::BAD_REQUEST, Json(json!({"message": "Bad Request"})));
        }
        return (
            StatusCode::OK,
            Json(json!({
                "token_type": "Bearer", "access_token": "access-1", "refresh_token": "refresh-1",
                "expires_at": far_future(),
                "athlete": {"id": 42, "firstname": "Marta", "lastname": "Silva"}
            })),
        );
    }
    fake.refreshes += 1;
    match fake.refresh_status {
        Some(status) => (
            StatusCode::from_u16(status).unwrap(),
            Json(json!({"message": "refused"})),
        ),
        None => (
            StatusCode::OK,
            Json(json!({
                "access_token": format!("access-refreshed-{}", fake.refreshes),
                "refresh_token": "refresh-2", "expires_at": far_future()
            })),
        ),
    }
}

async fn fake_upload(State(fake): State<Fake>, headers: HeaderMap, body: Bytes) -> (StatusCode, Json<Value>) {
    let mut fake = fake.lock().unwrap();
    fake.requests
        .push(("upload".into(), headers, String::from_utf8_lossy(&body).into_owned()));
    match fake.upload_status {
        Some(status) => (
            StatusCode::from_u16(status).unwrap(),
            Json(json!({"message": "refused"})),
        ),
        None => (
            StatusCode::CREATED,
            Json(
                json!({"id": 7, "status": "Your activity is still being processed.", "error": null, "activity_id": null}),
            ),
        ),
    }
}

async fn fake_upload_status(
    State(fake): State<Fake>,
    Path(id): Path<u64>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    let mut fake = fake.lock().unwrap();
    fake.requests.push(("status".into(), headers, String::new()));
    match fake.upload_status {
        Some(status) => (
            StatusCode::from_u16(status).unwrap(),
            Json(json!({"message": "refused"})),
        ),
        None => (
            StatusCode::OK,
            Json(json!({"id": id, "status": "Your activity is ready.", "error": null, "activity_id": 99})),
        ),
    }
}

async fn fake_activity(State(fake): State<Fake>, Path(id): Path<u64>, headers: HeaderMap, body: String) -> Json<Value> {
    fake.lock()
        .unwrap()
        .requests
        .push((format!("activity {id}"), headers, body));
    Json(json!({}))
}

/// Starts the stand-in Strava; returns its address and its notebook.
async fn fake_strava() -> (String, Fake) {
    let fake = Fake::default();
    let router = Router::new()
        .route("/oauth/token", post(fake_token))
        .route("/api/v3/uploads", post(fake_upload))
        .route("/api/v3/uploads/{id}", get(fake_upload_status))
        .route("/api/v3/activities/{id}", put(fake_activity))
        .with_state(Arc::clone(&fake));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    (url, fake)
}

fn config(strava_url: &str) -> Config {
    Config {
        route_file: PathBuf::from(ROUTES_DIR).join("rolling-hills.json"),
        target_riders: 0,
        bot_seed: Some(1),
        events: EventsSetting::Off,
        public_url: Some(PUBLIC_URL.into()),
        strava: Some(StravaConfig {
            client_id: "12345".into(),
            client_secret: "the-client-secret".into(),
            redirect_uri: format!("{PUBLIC_URL}/auth/strava/callback"),
            public_url: PUBLIC_URL.into(),
            api_url: strava_url.to_owned(),
            limited: true,
        }),
        ..Config::default()
    }
}

/// One run of the server; starting another with the same configuration is a restart.
async fn start_server(config: &Config) -> SocketAddr {
    let router = app::build(config).expect("app builds");
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    addr
}

struct Reply {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

impl Reply {
    fn all(&self, name: &str) -> Vec<&str> {
        self.headers
            .iter()
            .filter(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
            .collect()
    }

    fn json(&self) -> Value {
        serde_json::from_str(&self.body).unwrap_or_else(|_| panic!("JSON expected, got {:?}", self.body))
    }

    /// The `Set-Cookie` header for cookie `name`.
    fn set_cookie(&self, name: &str) -> Option<&str> {
        self.all("set-cookie")
            .into_iter()
            .find(|cookie| cookie.starts_with(&format!("{name}=")))
    }

    /// `name=value` of a cookie the reply sets, to send back like a browser.
    fn cookie(&self, name: &str) -> String {
        let set = self
            .set_cookie(name)
            .unwrap_or_else(|| panic!("no {name} cookie in {:?}", self.headers));
        set.split(';').next().unwrap().to_owned()
    }
}

async fn request(addr: SocketAddr, method: &str, path: &str, cookie: &str, body: &[u8]) -> Reply {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let mut head = format!("{method} {path} HTTP/1.1\r\nHost: test\r\nConnection: close\r\n");
    if !cookie.is_empty() {
        head.push_str(&format!("Cookie: {cookie}\r\n"));
    }
    if method != "GET" {
        head.push_str(&format!("Content-Length: {}\r\n", body.len()));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes()).await.unwrap();
    stream.write_all(body).await.unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).await.unwrap();
    let (head, body) = response.split_once("\r\n\r\n").unwrap_or((&response, ""));
    let mut lines = head.split("\r\n");
    let status = lines.next().unwrap()[9..12].parse().unwrap();
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_owned()))
        .collect();
    Reply {
        status,
        headers,
        body: body.to_owned(),
    }
}

async fn get_with(addr: SocketAddr, path: &str, cookie: &str) -> Reply {
    request(addr, "GET", path, cookie, b"").await
}

/// A FIT file as far as the server looks: the header with `.FIT` in it.
fn fit_file() -> Vec<u8> {
    let mut fit = vec![14, 0x20, 0x54, 0x08, 0, 0, 0, 0];
    fit.extend_from_slice(b".FIT");
    fit.extend_from_slice(&[0, 0, 1, 2, 3, 4]);
    fit
}

async fn upload(addr: SocketAddr, query: &str, cookie: &str) -> Reply {
    request(addr, "POST", &format!("/api/strava/upload{query}"), cookie, &fit_file()).await
}

/// "Connect with Strava" as a browser does it; returns the session cookie (`name=value`).
async fn connect(addr: SocketAddr) -> String {
    let start = get_with(addr, "/auth/strava", "").await;
    assert_eq!(start.status, 303);
    let state_cookie = start.cookie("openradlr_oauth_state");
    let state = state_cookie.split_once('=').unwrap().1;
    let back = get_with(
        addr,
        &format!("/auth/strava/callback?code=good-code&state={state}&scope=read,activity:write"),
        &state_cookie,
    )
    .await;
    assert_eq!(back.status, 303, "{}", back.body);
    assert_eq!(back.all("location"), ["/"]);
    back.cookie("openradlr_session")
}

fn assert_asks_to_connect_again(reply: &Reply, what: &str) {
    assert_eq!(reply.status, 401, "{what}: {}", reply.body);
    assert_eq!(reply.json()["code"], "not_connected", "{what}");
}

#[tokio::test]
async fn connecting_sets_cookies_the_page_cannot_read() {
    let (strava_url, fake) = fake_strava().await;
    let addr = start_server(&config(&strava_url)).await;

    let start = get_with(addr, "/auth/strava", "").await;
    assert_eq!(start.status, 303);
    let location = start.all("location")[0];
    assert!(
        location.starts_with(&format!(
            "{strava_url}/oauth/authorize?client_id=12345&response_type=code&redirect_uri=https%3A%2F%2Fride.example.org%2Fauth%2Fstrava%2Fcallback&approval_prompt=auto&scope=read%2Cactivity%3Awrite&state="
        )),
        "{location}"
    );
    let state_cookie = start.set_cookie("openradlr_oauth_state").unwrap();
    assert!(
        state_cookie.ends_with("; Path=/auth/strava; Max-Age=600; HttpOnly; SameSite=Lax; Secure"),
        "{state_cookie}"
    );

    let state = start.cookie("openradlr_oauth_state");
    let back = get_with(
        addr,
        &format!(
            "/auth/strava/callback?code=good-code&state={}&scope=read,activity:write",
            state.split_once('=').unwrap().1
        ),
        &state,
    )
    .await;
    assert_eq!((back.status, back.all("location")), (303, vec!["/"]));
    // The session: a random id, readable by no script, sent over https only, and
    // sent along from an <iframe> on the same site (SameSite=Lax is enough for
    // ride.example.org shown by example.org; a frame on another site would get no
    // cookie, which is intended).
    let session = back.set_cookie("openradlr_session").unwrap();
    assert!(
        session.ends_with("; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure"),
        "{session}"
    );
    let value = session.split(';').next().unwrap().split_once('=').unwrap().1;
    assert_eq!(value.len(), 64, "a random id, not a token");
    assert!(!session.contains("access-1") && !session.contains("refresh-1"));
    // The state cookie is used up.
    assert!(back.set_cookie("openradlr_oauth_state").unwrap().contains("Max-Age=0"));

    let me = get_with(addr, "/api/me", &back.cookie("openradlr_session")).await;
    assert_eq!(me.status, 200);
    assert_eq!(
        me.json(),
        json!({"athlete_id": 42, "name": "Marta S.", "can_upload": true})
    );
    assert!(!me.body.contains("access-1") && !me.body.contains("refresh-1"));

    // What Strava was told: the app's id and secret in the form, the fork's name as the caller.
    let fake = fake.lock().unwrap();
    assert!(fake.token_forms[0].contains("client_id=12345&client_secret=the-client-secret&code=good-code"));
    let agent = fake.requests[0].1["user-agent"].to_str().unwrap();
    assert!(
        agent.starts_with("GOCARMO-Ride/") && agent.ends_with("(+https://gocarmo.com/ride/)"),
        "{agent}"
    );
}

#[tokio::test]
async fn an_upload_names_the_fork_and_becomes_a_virtual_ride() {
    let (strava_url, fake) = fake_strava().await;
    let addr = start_server(&config(&strava_url)).await;
    let session = connect(addr).await;

    let sent = upload(addr, "?name=Rolling%20Hills%20%C2%B7%20GOCARMO%20Ride", &session).await;
    assert_eq!(sent.status, 200, "{}", sent.body);
    assert_eq!(sent.json()["id"], 7);
    let status = get_with(addr, "/api/strava/upload/7", &session).await;
    assert_eq!(status.status, 200);
    assert_eq!(status.json()["activity_id"], 99);
    // Without a name from the client the activity is named after the fork.
    assert_eq!(upload(addr, "", &session).await.status, 200);

    let fake = fake.lock().unwrap();
    let uploads: Vec<_> = fake.requests.iter().filter(|(kind, ..)| kind == "upload").collect();
    let (_, headers, body) = uploads[0];
    assert_eq!(headers["authorization"], "Bearer access-1");
    assert!(headers["user-agent"].to_str().unwrap().starts_with("GOCARMO-Ride/"));
    let field = |body: &str, name: &str| {
        let marker = format!("name=\"{name}\"");
        let after = body.split_once(&marker).unwrap_or_else(|| panic!("no {name} field")).1;
        let value = after.split_once("\r\n\r\n").unwrap().1;
        value.split_once("\r\n--").unwrap().0.to_owned()
    };
    assert_eq!(field(body, "name"), "Rolling Hills · GOCARMO Ride");
    assert_eq!(field(body, "description"), "GOCARMO Ride: https://ride.example.org");
    assert_eq!(field(body, "data_type"), "fit");
    let external_id = field(body, "external_id");
    assert!(external_id.starts_with("gocarmo-ride-42-"), "{external_id}");
    assert!(body.contains("filename=\"gocarmo-ride.fit\""));
    assert_eq!(field(&uploads[1].2, "name"), "GOCARMO Ride");
    // Nothing Strava receives presents the server as upstream's.
    for (kind, headers, body) in &fake.requests {
        let head = format!("{headers:?}").to_lowercase();
        assert!(!head.contains("openradlr"), "{kind}: {head}");
        assert!(!body.to_lowercase().contains("openradlr"), "{kind}: {body}");
    }
    // Once the activity exists, it is filed as a virtual ride.
    let (_, _, activity) = fake
        .requests
        .iter()
        .find(|(kind, ..)| kind == "activity 99")
        .expect("the activity was updated");
    assert_eq!(
        serde_json::from_str::<Value>(activity).unwrap(),
        json!({"sport_type": "VirtualRide"})
    );
}

#[tokio::test]
async fn without_a_data_directory_logins_end_with_the_server() {
    let (strava_url, _fake) = fake_strava().await;
    // With and without the key: no directory, nowhere to keep them.
    for secret_key in [None, Some(SECRET_KEY.to_owned())] {
        let config = Config {
            data_dir: None,
            secret_key,
            ..config(&strava_url)
        };
        let first = start_server(&config).await;
        let session = connect(first).await;
        assert_eq!(get_with(first, "/api/me", &session).await.status, 200);

        // The server restarts (a deploy, a crash, a free host waking up). The
        // browser still sends its cookie, the ride is finished and waits in the page.
        let restarted = start_server(&config).await;
        assert_asks_to_connect_again(&get_with(restarted, "/api/me", &session).await, "me");
        assert_asks_to_connect_again(&upload(restarted, "?name=Ride", &session).await, "upload");
        assert_asks_to_connect_again(
            &get_with(restarted, "/api/strava/upload/7", &session).await,
            "upload status",
        );
        // Connecting again works at once, and so does the upload after it.
        let again = connect(restarted).await;
        assert_eq!(upload(restarted, "?name=Ride", &again).await.status, 200);
    }
}

#[tokio::test]
async fn with_a_data_directory_and_key_logins_survive_a_restart() {
    let (strava_url, fake) = fake_strava().await;
    let dir = std::env::temp_dir().join(format!("openradlr-strava-flow-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let config = Config {
        data_dir: Some(dir.clone()),
        secret_key: Some(SECRET_KEY.to_owned()),
        ..config(&strava_url)
    };
    let first = start_server(&config).await;
    let session = connect(first).await;

    let restarted = start_server(&config).await;
    let me = get_with(restarted, "/api/me", &session).await;
    assert_eq!(me.status, 200);
    assert_eq!(me.json()["name"], "Marta S.");
    // The access token was not kept: the first upload fetches a new one.
    assert_eq!(upload(restarted, "?name=Ride", &session).await.status, 200);
    {
        let fake = fake.lock().unwrap();
        assert_eq!(fake.refreshes, 1);
        assert!(fake.token_forms.last().unwrap().contains("refresh_token=refresh-1"));
        let (_, headers, _) = fake.requests.iter().rev().find(|(kind, ..)| kind == "upload").unwrap();
        assert_eq!(headers["authorization"], "Bearer access-refreshed-1");
    }
    // Neither the tokens nor the session id are in the database in the clear.
    let database = std::fs::read(dir.join("openradlr.db")).unwrap();
    let text = String::from_utf8_lossy(&database);
    let id = session.split_once('=').unwrap().1;
    assert!(!text.contains("refresh-1") && !text.contains("access-1") && !text.contains(id));

    // A data directory without the key keeps nothing.
    let keyless = Config {
        secret_key: None,
        ..config.clone()
    };
    let unkeyed = start_server(&keyless).await;
    assert_asks_to_connect_again(&get_with(unkeyed, "/api/me", &session).await, "no key");
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_rider_strava_no_longer_knows_is_asked_to_connect_again() {
    let (strava_url, fake) = fake_strava().await;
    let dir = std::env::temp_dir().join(format!("openradlr-strava-revoked-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let config = Config {
        data_dir: Some(dir.clone()),
        secret_key: Some(SECRET_KEY.to_owned()),
        ..config(&strava_url)
    };
    let session = connect(start_server(&config).await).await;

    // Restored after a restart, but the rider removed the app in their Strava
    // settings meanwhile: the refresh token is refused.
    let restarted = start_server(&config).await;
    fake.lock().unwrap().refresh_status = Some(400);
    let refused = upload(restarted, "?name=Ride", &session).await;
    assert_asks_to_connect_again(&refused, "refused refresh");
    assert!(
        refused
            .set_cookie("openradlr_session")
            .is_some_and(|cookie| cookie.contains("Max-Age=0")),
        "the dead session's cookie is cleared: {:?}",
        refused.headers
    );
    // The session is forgotten, not retried for ever.
    assert_asks_to_connect_again(&get_with(restarted, "/api/me", &session).await, "me afterwards");
    let refreshes = fake.lock().unwrap().refreshes;
    assert_asks_to_connect_again(&upload(restarted, "?name=Ride", &session).await, "second try");
    assert_eq!(fake.lock().unwrap().refreshes, refreshes, "Strava is not asked again");

    // The same when Strava refuses the access token itself (401 on the upload).
    fake.lock().unwrap().refresh_status = None;
    let live = connect(restarted).await;
    fake.lock().unwrap().upload_status = Some(401);
    assert_asks_to_connect_again(&upload(restarted, "?name=Ride", &live).await, "refused upload");
    let other = connect(restarted).await;
    assert_asks_to_connect_again(
        &get_with(restarted, "/api/strava/upload/7", &other).await,
        "refused status",
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn strava_being_down_does_not_log_the_rider_out() {
    let (strava_url, fake) = fake_strava().await;
    let addr = start_server(&config(&strava_url)).await;
    let session = connect(addr).await;

    for status in [500, 503, 429, 403] {
        fake.lock().unwrap().upload_status = Some(status);
        let failed = upload(addr, "?name=Ride", &session).await;
        assert_eq!(failed.status, 502, "{status}");
        assert_eq!(failed.json()["code"], "upload_failed");
        let check = get_with(addr, "/api/strava/upload/7", &session).await;
        assert_eq!(
            (check.status, check.json()["code"].clone()),
            (502, json!("status_failed"))
        );
    }
    // Still connected: the rider tries again later, with the same ride.
    assert_eq!(get_with(addr, "/api/me", &session).await.status, 200);
    fake.lock().unwrap().upload_status = None;
    assert_eq!(upload(addr, "?name=Ride", &session).await.status, 200);
}

#[tokio::test]
async fn a_failed_token_refresh_that_is_stravas_fault_keeps_the_login() {
    let (strava_url, fake) = fake_strava().await;
    let dir = std::env::temp_dir().join(format!("openradlr-strava-down-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let config = Config {
        data_dir: Some(dir.clone()),
        secret_key: Some(SECRET_KEY.to_owned()),
        ..config(&strava_url)
    };
    let session = connect(start_server(&config).await).await;
    let restarted = start_server(&config).await;

    fake.lock().unwrap().refresh_status = Some(503);
    let failed = upload(restarted, "?name=Ride", &session).await;
    assert_eq!(
        (failed.status, failed.json()["code"].clone()),
        (502, json!("strava_unavailable"))
    );
    assert!(failed.set_cookie("openradlr_session").is_none());
    fake.lock().unwrap().refresh_status = None;
    assert_eq!(upload(restarted, "?name=Ride", &session).await.status, 200);
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn made_up_and_missing_cookies_and_files_get_plain_answers() {
    let (strava_url, _fake) = fake_strava().await;
    let addr = start_server(&config(&strava_url)).await;
    let session = connect(addr).await;

    for cookie in [
        "",
        "openradlr_session=",
        "openradlr_session=made-up",
        "openradlr_session=../../etc/passwd",
        &format!("openradlr_session={}", "a".repeat(5000)),
    ] {
        let label = &cookie[..cookie.len().min(40)];
        assert_asks_to_connect_again(&get_with(addr, "/api/me", cookie).await, label);
        assert_asks_to_connect_again(&upload(addr, "?name=Ride", cookie).await, label);
    }
    // Connected, but what arrives is no ride file.
    let not_a_ride = request(addr, "POST", "/api/strava/upload", &session, b"hello").await;
    assert_eq!(
        (not_a_ride.status, not_a_ride.json()["code"].clone()),
        (400, json!("not_a_ride"))
    );
    let empty = request(addr, "POST", "/api/strava/upload", &session, b"").await;
    assert_eq!(empty.status, 400);
    // Logging out ends the session for good.
    let out = request(addr, "POST", "/auth/logout", &session, b"").await;
    assert_eq!(out.status, 204);
    assert!(out.set_cookie("openradlr_session").unwrap().contains("Max-Age=0"));
    assert_asks_to_connect_again(&get_with(addr, "/api/me", &session).await, "after logout");
}

#[tokio::test]
async fn a_login_that_does_not_complete_ends_on_the_start_page_with_a_reason() {
    let (strava_url, _fake) = fake_strava().await;
    let addr = start_server(&config(&strava_url)).await;
    let start = get_with(addr, "/auth/strava", "").await;
    let state_cookie = start.cookie("openradlr_oauth_state");
    let state = state_cookie.split_once('=').unwrap().1.to_owned();

    // "Cancel" on Strava's page.
    let denied = get_with(addr, "/auth/strava/callback?error=access_denied", &state_cookie).await;
    assert_eq!((denied.status, denied.all("location")), (303, vec!["/?strava=denied"]));
    // The answer arrives in another browser (no state cookie), or with a made-up state.
    let elsewhere = get_with(addr, &format!("/auth/strava/callback?code=good-code&state={state}"), "").await;
    assert_eq!(elsewhere.all("location"), ["/?strava=expired"]);
    assert!(elsewhere.set_cookie("openradlr_session").is_none());
    // Strava does not accept the code.
    let refused = get_with(
        addr,
        &format!("/auth/strava/callback?code=bad-code&state={state}&scope=read,activity:write"),
        &state_cookie,
    )
    .await;
    assert_eq!(refused.all("location"), ["/?strava=failed"]);
    assert!(refused.set_cookie("openradlr_session").is_none());
    // The state was used up by that attempt.
    let replay = get_with(
        addr,
        &format!("/auth/strava/callback?code=good-code&state={state}&scope=read,activity:write"),
        &state_cookie,
    )
    .await;
    assert_eq!(replay.all("location"), ["/?strava=expired"]);
}

#[tokio::test]
async fn without_the_upload_permission_the_rider_is_told_so() {
    let (strava_url, fake) = fake_strava().await;
    let addr = start_server(&config(&strava_url)).await;
    let start = get_with(addr, "/auth/strava", "").await;
    let state_cookie = start.cookie("openradlr_oauth_state");
    let state = state_cookie.split_once('=').unwrap().1;
    // The rider unticked "upload activities" on Strava's page.
    let back = get_with(
        addr,
        &format!("/auth/strava/callback?code=good-code&state={state}&scope=read"),
        &state_cookie,
    )
    .await;
    let session = back.cookie("openradlr_session");
    assert_eq!(get_with(addr, "/api/me", &session).await.json()["can_upload"], false);
    let refused = upload(addr, "?name=Ride", &session).await;
    assert_eq!(
        (refused.status, refused.json()["code"].clone()),
        (403, json!("upload_not_allowed"))
    );
    assert!(fake.lock().unwrap().requests.iter().all(|(kind, ..)| kind != "upload"));
}

/// The client asks `/api/info` whether Strava's athlete limit still holds for
/// this server's application, and offers the ride file first while it does.
#[tokio::test]
async fn info_says_whether_the_athlete_limit_still_holds() {
    let (strava_url, _fake) = fake_strava().await;
    let mut config = config(&strava_url);
    let info = request(start_server(&config).await, "GET", "/api/info", "", b"")
        .await
        .json();
    assert_eq!(info["strava"]["enabled"], true);
    assert_eq!(info["strava"]["limited"], true, "a new application is limited");

    config.strava.as_mut().unwrap().limited = false;
    let info = request(start_server(&config).await, "GET", "/api/info", "", b"")
        .await
        .json();
    assert_eq!(info["strava"]["enabled"], true);
    assert_eq!(info["strava"]["limited"], false);

    config.strava = None;
    let info = request(start_server(&config).await, "GET", "/api/info", "", b"")
        .await
        .json();
    assert_eq!(info["strava"]["enabled"], false);
    assert_eq!(info["strava"]["limited"], true, "nothing to connect to");
}
