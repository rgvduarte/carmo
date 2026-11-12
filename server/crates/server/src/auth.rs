//! HTTP handlers for "Connect with Strava" and ride uploads.
//!
//! | Route                          | Purpose                                       |
//! |--------------------------------|-----------------------------------------------|
//! | `GET /auth/strava`             | Start the OAuth flow (redirect to Strava)     |
//! | `GET /auth/strava/callback`    | Back from Strava: create the session cookie   |
//! | `POST /auth/strava/app`        | The app starts a login (see [`AppLogins`])    |
//! | `POST /auth/strava/app/claim`  | The app's web view takes the new session      |
//! | `POST /auth/logout`            | Withdraw the access on Strava, forget the athlete |
//! | `GET /api/me`                  | The connected account, 204 or 401             |
//! | `POST /api/strava/upload`      | Upload a FIT or TCX ride (body), `?name=`, `?kind=class`, `?start=` |
//! | `GET /api/strava/upload/{id}`  | Whether Strava finished processing it         |
//! | `GET/POST /auth/strava/webhook/{token}` | Strava's webhook: an athlete withdrew access |
//!
//! The routes that act on a rider's account (`POST`) answer only requests from
//! the game's own pages: any other page of the same site (gocarmo.com and
//! every other host under it) could otherwise send them with the rider's
//! cookie (see [`foreign_page`]).

use crate::guard::same_secret;
use crate::guard::Slots;
use crate::http::AppState;
use crate::session_store::SessionStore;
use crate::strava::{
    authorize_url, cookie, cookie_count, cookie_value, login_result_url, scope_allows_upload, Account, Accounts,
    AppLogins, StravaConfig, APP_ID_COOKIE, APP_LOGIN_COOKIE, SESSION_COOKIE, SESSION_SECONDS, STATE_COOKIE,
    STATE_SECONDS,
};
use crate::strava_api;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{AppendHeaders, IntoResponse, Redirect, Response};
use axum::Json;
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Everything the Strava routes need, present only if Strava is configured.
pub struct Strava {
    pub config: StravaConfig,
    pub accounts: Accounts,
    pub http: reqwest::Client,
    pub required: bool,
    /// Send cookies with `Secure` (the public URL is https).
    pub secure_cookies: bool,
    /// One live connection per Strava athlete.
    pub riders: Slots<u64>,
    /// Logins from the app's system sign-in sheet.
    pub app_logins: AppLogins,
}

impl Strava {
    pub fn new(
        config: StravaConfig,
        required: bool,
        secure_cookies: bool,
        store: Option<SessionStore>,
    ) -> Result<Self, reqwest::Error> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(crate::user_agent())
            .build()?;
        Ok(Self {
            config,
            accounts: store.map_or_else(Accounts::default, |store| Accounts::with_store(store, now_s())),
            http,
            required,
            secure_cookies,
            riders: Slots::new(1),
            app_logins: AppLogins::default(),
        })
    }

    /// The account behind the request's session cookie. A request with two
    /// session cookies has none: another host of the same domain can plant a
    /// second one with a longer path, which the browser sends first.
    pub fn account(&self, headers: &HeaderMap) -> Option<(String, Account)> {
        let cookies = || headers.get_all(header::COOKIE).iter().filter_map(|v| v.to_str().ok());
        if cookie_count(cookies(), SESSION_COOKIE) > 1 {
            return None;
        }
        let session = cookie_value(cookies(), SESSION_COOKIE)?.to_owned();
        let account = self.accounts.get(&session, now_s())?;
        Some((session, account))
    }

    /// Whether the request carries a session cookie at all, valid or not.
    pub fn has_session_cookie(&self, headers: &HeaderMap) -> bool {
        let cookies = headers.get_all(header::COOKIE).iter().filter_map(|v| v.to_str().ok());
        cookie_value(cookies, SESSION_COOKIE).is_some_and(|value| !value.is_empty())
    }

    /// A valid access token, refreshed first if it is about to expire.
    async fn access_token(&self, account: &Account) -> Result<String, strava_api::StravaError> {
        if !account.needs_refresh(now_s()) {
            return Ok(account.access_token.clone());
        }
        let token = strava_api::refresh(&self.http, &self.config, &account.refresh_token).await?;
        self.accounts.update_tokens(account.athlete_id, &token);
        Ok(token.access_token)
    }
}

pub fn now_s() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// The origin (`scheme://host[:port]`) of a URL such as `OPENRADLR_PUBLIC_URL`.
fn origin_of(url: &str) -> &str {
    match url.find("://") {
        Some(scheme_end) => {
            let rest = &url[scheme_end + 3..];
            &url[..scheme_end + 3 + rest.find('/').unwrap_or(rest.len())]
        }
        None => url,
    }
}

/// True when a request that changes a rider's account comes from a page that
/// is not the game's own. The browser says where a request comes from:
/// `Sec-Fetch-Site` (`same-origin` for the game itself, `same-site` for
/// another host of the domain, which the session cookie would otherwise reach
/// too) and `Origin`. Requests without either (tools, the tests) pass, as
/// they carry no rider's cookie unless their author put it there.
fn foreign_page(headers: &HeaderMap, public_url: &str) -> bool {
    let header_text = |name| headers.get(name).map(|value| value.to_str().unwrap_or("?"));
    if header_text("sec-fetch-site").is_some_and(|site| site != "same-origin") {
        return true;
    }
    header_text(header::ORIGIN.as_str()).is_some_and(|origin| !origin.eq_ignore_ascii_case(origin_of(public_url)))
}

fn from_another_page() -> Response {
    error(
        StatusCode::FORBIDDEN,
        "foreign_page",
        "only the game's own pages may do this",
    )
}

fn error(status: StatusCode, code: &str, message: &str) -> Response {
    (status, Json(serde_json::json!({ "code": code, "message": message }))).into_response()
}

fn not_connected() -> Response {
    error(
        StatusCode::UNAUTHORIZED,
        "not_connected",
        "connect your Strava account first",
    )
}

/// Strava no longer accepts this session's tokens: the rider withdrew this
/// server's access in their Strava settings, or the tokens are stale. Trying
/// again cannot work, so the session is forgotten and the answer is the one
/// for no session: the client keeps the ride and offers to connect again.
fn disconnected(strava: &Strava, session: &str) -> Response {
    tracing::info!("strava refused a session's tokens; the rider has to connect again");
    strava.accounts.remove(session);
    let clear = cookie(SESSION_COOKIE, "", "/", 0, strava.secure_cookies);
    let mut response = not_connected();
    if let Ok(value) = clear.parse() {
        response.headers_mut().insert(header::SET_COOKIE, value);
    }
    response
}

fn not_configured() -> Response {
    error(
        StatusCode::NOT_FOUND,
        "strava_disabled",
        "this server has no Strava connection",
    )
}

#[derive(Debug, Deserialize)]
pub struct LoginQuery {
    /// An app login's id: the login ends in the app (see [`AppLogins`]).
    pub app: Option<String>,
}

pub async fn login(State(state): State<AppState>, Query(query): Query<LoginQuery>) -> Response {
    let Some(strava) = state.strava.as_deref() else {
        return not_configured();
    };
    let oauth_state = strava.accounts.new_state(now_s());
    let secure = strava.secure_cookies;
    let app_id = query.app.filter(|id| strava.app_logins.is_pending(id, now_s()));
    (
        AppendHeaders([
            (
                header::SET_COOKIE,
                cookie(STATE_COOKIE, &oauth_state, "/auth/strava", STATE_SECONDS, secure),
            ),
            // Always written, so a browser login after an app login ends in the browser.
            (
                header::SET_COOKIE,
                match &app_id {
                    Some(id) => cookie(APP_ID_COOKIE, id, "/auth/strava", STATE_SECONDS, secure),
                    None => cookie(APP_ID_COOKIE, "", "/auth/strava", 0, secure),
                },
            ),
        ]),
        Redirect::to(&authorize_url(&strava.config, &oauth_state)),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub scope: Option<String>,
    pub error: Option<String>,
}

pub async fn callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CallbackQuery>,
) -> Response {
    let Some(strava) = state.strava.as_deref() else {
        return not_configured();
    };
    let cookie_of = |name| {
        let cookies = headers.get_all(header::COOKIE).iter().filter_map(|v| v.to_str().ok());
        cookie_value(cookies, name).map(str::to_owned)
    };
    let app_id = cookie_of(APP_ID_COOKIE).filter(|id| !id.is_empty());
    let back = |result: &str| Redirect::to(&login_result_url(app_id.is_some(), result, None)).into_response();
    // The rider pressed "Cancel" on Strava.
    if query.error.is_some() {
        return back("denied");
    }
    let (Some(code), Some(oauth_state)) = (query.code, query.state) else {
        return error(StatusCode::BAD_REQUEST, "bad_callback", "missing code or state");
    };
    let same_browser = cookie_of(STATE_COOKIE).as_deref() == Some(oauth_state.as_str());
    if !same_browser || !strava.accounts.take_state(&oauth_state, now_s()) {
        return back("expired");
    }

    let token = match strava_api::exchange_code(&strava.http, &strava.config, &code).await {
        Ok(token) => token,
        Err(e) => {
            tracing::warn!(error = %e, "strava token exchange failed");
            return back("failed");
        }
    };
    let Some(account) = Account::from_token(token, scope_allows_upload(query.scope.as_deref())) else {
        tracing::warn!("strava token response without athlete");
        return back("failed");
    };
    // No athlete number in the log: the host's log is not the place for Strava data.
    tracing::info!(app = app_id.is_some(), "strava account connected");
    let session = strava.accounts.insert(account, now_s());
    let secure = strava.secure_cookies;
    let clear_state = cookie(STATE_COOKIE, "", "/auth/strava", 0, secure);
    if let Some(id) = &app_id {
        // The sign-in sheet has its own cookies: the app's web view claims the session.
        let Some(ticket) = strava.app_logins.complete(id, session.clone(), now_s()) else {
            strava.accounts.remove(&session);
            return back("expired");
        };
        let clear_app = cookie(APP_ID_COOKIE, "", "/auth/strava", 0, secure);
        return (
            AppendHeaders([(header::SET_COOKIE, clear_state), (header::SET_COOKIE, clear_app)]),
            Redirect::to(&login_result_url(true, "connected", Some(&ticket))),
        )
            .into_response();
    }
    // Two Set-Cookie headers: a plain header array would keep only the last one.
    (
        AppendHeaders([
            (
                header::SET_COOKIE,
                cookie(SESSION_COOKIE, &session, "/", SESSION_SECONDS, secure),
            ),
            (header::SET_COOKIE, clear_state),
        ]),
        back("connected"),
    )
        .into_response()
}

#[derive(Debug, Serialize)]
pub struct AppLoginResponse {
    /// Open this in the system sign-in sheet.
    pub url: String,
}

/// The app starts a login: the secret stays in its web view, the id goes to the sign-in sheet.
pub async fn app_login(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(strava) = state.strava.as_deref() else {
        return not_configured();
    };
    if foreign_page(&headers, &strava.config.public_url) {
        return from_another_page();
    }
    let (id, secret) = strava.app_logins.start(now_s());
    (
        [(
            header::SET_COOKIE,
            cookie(
                APP_LOGIN_COOKIE,
                &secret,
                "/auth/strava/app",
                STATE_SECONDS,
                strava.secure_cookies,
            ),
        )],
        Json(AppLoginResponse {
            url: format!("/auth/strava?app={id}"),
        }),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
pub struct ClaimRequest {
    /// From the `openradlr://` URL the sign-in sheet ended on.
    pub ticket: String,
}

/// Back in the app: the web view trades its secret and the ticket for the session cookie.
pub async fn app_claim(State(state): State<AppState>, headers: HeaderMap, Json(claim): Json<ClaimRequest>) -> Response {
    let Some(strava) = state.strava.as_deref() else {
        return not_configured();
    };
    if foreign_page(&headers, &strava.config.public_url) {
        return from_another_page();
    }
    let cookies = headers.get_all(header::COOKIE).iter().filter_map(|v| v.to_str().ok());
    let session = cookie_value(cookies, APP_LOGIN_COOKIE)
        .and_then(|secret| strava.app_logins.claim(secret, &claim.ticket, now_s()));
    let Some(session) = session else {
        return error(StatusCode::NOT_FOUND, "no_login", "no finished Strava login to claim");
    };
    let secure = strava.secure_cookies;
    (
        StatusCode::NO_CONTENT,
        AppendHeaders([
            (
                header::SET_COOKIE,
                cookie(SESSION_COOKIE, &session, "/", SESSION_SECONDS, secure),
            ),
            (
                header::SET_COOKIE,
                cookie(APP_LOGIN_COOKIE, "", "/auth/strava/app", 0, secure),
            ),
        ]),
    )
        .into_response()
}

#[derive(Debug, Serialize)]
pub struct LogoutResponse {
    /// Strava confirmed that this server's access to the athlete is withdrawn.
    /// False when there was no account, or Strava could not be reached: the
    /// rider then withdraws it in Strava's settings.
    pub revoked: bool,
    /// Sessions of the athlete this server forgot (on every device).
    pub removed: usize,
}

/// "Disconnect": this server withdraws its access on Strava (which frees the
/// athlete's place in the application's athlete limit) and forgets every
/// session of the athlete, on every device, in memory and on disk. What the
/// rider is shown is the written confirmation Strava's API Policy asks for.
pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(strava) = state.strava.as_deref() else {
        return not_configured();
    };
    if foreign_page(&headers, &strava.config.public_url) {
        return from_another_page();
    }
    let mut answer = LogoutResponse {
        revoked: false,
        removed: 0,
    };
    if let Some((_, account)) = strava.account(&headers) {
        match strava_api::revoke(&strava.http, &strava.config, &account.refresh_token).await {
            Ok(()) => answer.revoked = true,
            Err(e) => tracing::warn!(error = %e, "withdrawing the access on strava failed"),
        }
        // Strava's revocation ends every token of the athlete: every session goes with it.
        answer.removed = strava.accounts.remove_athlete(account.athlete_id);
        tracing::info!(revoked = answer.revoked, "strava account disconnected");
    }
    (
        [(
            header::SET_COOKIE,
            cookie(SESSION_COOKIE, "", "/", 0, strava.secure_cookies),
        )],
        Json(answer),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
pub struct WebhookCheck {
    #[serde(rename = "hub.mode")]
    pub mode: Option<String>,
    #[serde(rename = "hub.verify_token")]
    pub verify_token: Option<String>,
    #[serde(rename = "hub.challenge")]
    pub challenge: Option<String>,
}

/// The webhook's address carries its secret (`OPENRADLR_STRAVA_WEBHOOK_TOKEN`):
/// Strava's events are not signed, so only who knows the address can send one.
fn webhook_open<'a>(state: &'a AppState, token: &str) -> Option<&'a Strava> {
    let strava = state.strava.as_deref()?;
    let expected = strava.config.webhook_token.as_deref()?;
    same_secret(token, expected).then_some(strava)
}

/// Strava checks the webhook once, when the owner creates the subscription
/// (developers.strava.com/docs/webhooks, read 12.11.2026): it sends
/// `hub.challenge` and the `hub.verify_token` it was given, and wants the
/// challenge back within two seconds.
pub async fn webhook_check(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Query(check): Query<WebhookCheck>,
) -> Response {
    let Some(strava) = webhook_open(&state, &token) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let expected = strava.config.webhook_token.as_deref().unwrap_or_default();
    match (check.mode.as_deref(), check.verify_token.as_deref(), check.challenge) {
        (Some("subscribe"), Some(given), Some(challenge)) if same_secret(given, expected) => {
            Json(serde_json::json!({ "hub.challenge": challenge })).into_response()
        }
        _ => StatusCode::FORBIDDEN.into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct WebhookEvent {
    pub object_type: Option<String>,
    pub owner_id: Option<u64>,
    #[serde(default)]
    pub updates: serde_json::Map<String, serde_json::Value>,
}

/// An event from Strava. The one this server acts on: an athlete withdrew
/// its access in Strava's settings (`object_type` athlete, `updates.authorized`
/// "false"). Every session of the athlete is forgotten at once. Strava wants an
/// answer within two seconds, whatever the event.
pub async fn webhook_event(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(event): Json<WebhookEvent>,
) -> Response {
    let Some(strava) = webhook_open(&state, &token) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let withdrawn = event.object_type.as_deref() == Some("athlete")
        && event.updates.get("authorized").and_then(|v| v.as_str()) == Some("false");
    if let (true, Some(athlete_id)) = (withdrawn, event.owner_id) {
        let removed = strava.accounts.remove_athlete(athlete_id);
        tracing::info!(sessions = removed, "strava access withdrawn by the athlete");
    }
    StatusCode::OK.into_response()
}

/// The connected account. No Strava name: the server keeps none (see
/// [`crate::strava::Athlete`]).
#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub athlete_id: u64,
    pub can_upload: bool,
}

pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(strava) = state.strava.as_deref() else {
        return not_configured();
    };
    match strava.account(&headers) {
        Some((_, account)) => Json(MeResponse {
            athlete_id: account.athlete_id,
            can_upload: account.can_upload,
        })
        .into_response(),
        // Nobody has signed in on this browser. The page asks this on every
        // load, so it is no error: an empty answer, not a 401 in every
        // visitor's console.
        None if !strava.has_session_cookie(&headers) => StatusCode::NO_CONTENT.into_response(),
        // A cookie whose login is gone (the server restarted without a disk,
        // or the login ran out): say so once and take the cookie back, so
        // the next load is the case above.
        None => {
            let mut response = not_connected();
            if let Ok(value) = cookie(SESSION_COOKIE, "", "/", 0, strava.secure_cookies).parse() {
                response.headers_mut().insert(header::SET_COOKIE, value);
            }
            response
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UploadQuery {
    pub name: Option<String>,
    /// `class` for a class in the studio; anything else is a ride on a route.
    pub kind: Option<String>,
    /// When the ride started (Unix seconds), so a second attempt at the same
    /// ride carries the same `external_id`.
    pub start: Option<i64>,
}

/// Seconds until Strava's next quarter hour, when its 15-minute request
/// budget starts again (developers.strava.com/docs/rate-limits).
fn until_next_quarter_hour(now_s: i64) -> i64 {
    900 - now_s.rem_euclid(900)
}

/// What the browser is told when Strava said no to an upload or to a question
/// about one. A refusal (Strava answered, and the ride is not on Strava) is a
/// 4xx the game can say plainly; only no answer or Strava's own failure is
/// uncertain (502), and then the rider checks Strava before sending again.
fn strava_refused(e: &strava_api::StravaError, uncertain_code: &str, uncertain_message: &str) -> Response {
    match e.status {
        Some(429) => {
            let mut response = error(
                StatusCode::TOO_MANY_REQUESTS,
                "strava_busy",
                "Strava is receiving too many requests; the ride was not sent",
            );
            if let Ok(value) = until_next_quarter_hour(now_s()).to_string().parse() {
                response.headers_mut().insert(header::RETRY_AFTER, value);
            }
            response
        }
        Some(400 | 403 | 404 | 409 | 422) => error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "strava_refused",
            "Strava refused the ride",
        ),
        _ => error(StatusCode::BAD_GATEWAY, uncertain_code, uncertain_message),
    }
}

pub async fn upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<UploadQuery>,
    body: axum::body::Bytes,
) -> Response {
    let Some(strava) = state.strava.as_deref() else {
        return not_configured();
    };
    if foreign_page(&headers, &strava.config.public_url) {
        return from_another_page();
    }
    // Also after a restart without a data directory: the cookie is from a
    // session this server no longer knows.
    let Some((session, account)) = strava.account(&headers) else {
        return not_connected();
    };
    if !account.can_upload {
        return error(
            StatusCode::FORBIDDEN,
            "upload_not_allowed",
            "allow \"upload activities\" when connecting Strava",
        );
    }
    let Some(ride) = strava_api::RideFile::detect(&body) else {
        return error(
            StatusCode::BAD_REQUEST,
            "not_a_ride",
            "the ride must be a FIT or TCX file",
        );
    };
    let name: String = query
        .name
        .unwrap_or_else(|| strava_api::DEFAULT_ACTIVITY_NAME.into())
        .chars()
        .filter(|c| !c.is_control())
        .take(100)
        .collect();
    let access_token = match strava.access_token(&account).await {
        Ok(token) => token,
        Err(e) if e.refresh_rejected() => return disconnected(strava, &session),
        Err(e) => {
            tracing::warn!(error = %e, "strava token refresh failed");
            return error(
                StatusCode::BAD_GATEWAY,
                "strava_unavailable",
                "could not reach Strava, try again",
            );
        }
    };
    // The ride's own start when the client gives one (a plausible time, from
    // 2020 to a day ahead), so every attempt at one ride has one id.
    let started = query
        .start
        .filter(|start| (1_577_836_800..=now_s() + 86_400).contains(start))
        .unwrap_or_else(now_s);
    let external_id = format!("{}-{}-{}", strava_api::EXTERNAL_ID_PREFIX, account.athlete_id, started);
    let kind = match query.kind.as_deref() {
        Some("class") => strava_api::RideKind::Class,
        _ => strava_api::RideKind::Route,
    };
    match strava_api::upload(
        &strava.http,
        &strava.config,
        &access_token,
        ride,
        kind,
        &name,
        &strava_api::description(),
        &external_id,
    )
    .await
    {
        Ok(status) => Json(status).into_response(),
        Err(e) if e.unauthorized() => disconnected(strava, &session),
        Err(e) => {
            tracing::warn!(error = %e, "strava upload failed");
            strava_refused(
                &e,
                "upload_failed",
                "Strava didn't answer the upload, check Strava before sending again",
            )
        }
    }
}

pub async fn upload_status(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<u64>) -> Response {
    let Some(strava) = state.strava.as_deref() else {
        return not_configured();
    };
    let Some((session, account)) = strava.account(&headers) else {
        return not_connected();
    };
    let access_token = match strava.access_token(&account).await {
        Ok(token) => token,
        Err(e) if e.refresh_rejected() => return disconnected(strava, &session),
        Err(_) => return error(StatusCode::BAD_GATEWAY, "strava_unavailable", "could not reach Strava"),
    };
    match strava_api::upload_status(&strava.http, &strava.config, &access_token, id).await {
        Ok(status) => Json(status).into_response(),
        Err(e) if e.unauthorized() => disconnected(strava, &session),
        Err(e) if e.status == Some(429) => strava_refused(&e, "status_failed", ""),
        Err(e) => {
            tracing::warn!(error = %e, "strava upload status failed");
            error(
                StatusCode::BAD_GATEWAY,
                "status_failed",
                "could not ask Strava about the upload",
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.insert(*name, value.parse().unwrap());
        }
        map
    }

    #[test]
    fn only_the_games_own_pages_may_change_an_account() {
        let url = "https://ride.example.org";
        assert!(!foreign_page(&headers(&[]), url), "no browser: no rider's cookie");
        assert!(!foreign_page(
            &headers(&[
                ("sec-fetch-site", "same-origin"),
                ("origin", "https://ride.example.org")
            ]),
            url
        ));
        // Another host of the same site: the cookie would go along, so no.
        assert!(foreign_page(&headers(&[("sec-fetch-site", "same-site")]), url));
        assert!(foreign_page(&headers(&[("origin", "https://example.org")]), url));
        assert!(foreign_page(
            &headers(&[("sec-fetch-site", "cross-site"), ("origin", "https://evil.example")]),
            url
        ));
        assert!(foreign_page(&headers(&[("origin", "null")]), url));
        assert_eq!(origin_of("https://ride.example.org/game/"), "https://ride.example.org");
        assert_eq!(origin_of("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
    }

    #[test]
    fn a_busy_strava_is_asked_again_at_the_next_quarter_hour() {
        assert_eq!(until_next_quarter_hour(0), 900);
        assert_eq!(until_next_quarter_hour(899), 1);
        assert_eq!(until_next_quarter_hour(1_800_000_450), 450);
    }
}
