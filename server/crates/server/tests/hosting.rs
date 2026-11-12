//! End-to-end tests for a server behind a hosting platform and inside another
//! site's page: framing, CORS, and the client address a platform proxy reports.

use axum::http::HeaderName;
use openradlr_server::app;
use openradlr_server::config::{Config, EventsSetting};
use std::net::SocketAddr;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Error as WsError;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

type Socket = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

const ROUTES_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../routes");

fn test_config() -> Config {
    Config {
        route_file: PathBuf::from(ROUTES_DIR).join("rolling-hills.json"),
        target_riders: 0,
        bot_seed: Some(1),
        events: EventsSetting::Off,
        ..Config::default()
    }
}

/// Serves like `app::run` does: with the peer address of every connection.
async fn start_server(config: Config) -> SocketAddr {
    let router = app::build(&config).expect("app builds");
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>())
            .await
            .unwrap();
    });
    addr
}

struct Reply {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

impl Reply {
    /// Every value of header `name` (given in lower case).
    fn all(&self, name: &str) -> Vec<&str> {
        self.headers
            .iter()
            .filter(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
            .collect()
    }

    fn header(&self, name: &str) -> Option<&str> {
        self.all(name).first().copied()
    }

    /// The directives of the Content-Security-Policy.
    fn csp(&self) -> Vec<&str> {
        self.header("content-security-policy")
            .expect("a policy")
            .split("; ")
            .collect()
    }
}

/// A plain HTTP/1.1 request without an extra client dependency.
async fn request(addr: SocketAddr, method: &str, path: &str, headers: &[(&str, &str)]) -> Reply {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let mut text = format!("{method} {path} HTTP/1.1\r\nHost: test\r\nConnection: close\r\n");
    for (name, value) in headers {
        text.push_str(&format!("{name}: {value}\r\n"));
    }
    text.push_str("\r\n");
    stream.write_all(text.as_bytes()).await.unwrap();
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

async fn get(addr: SocketAddr, path: &str, headers: &[(&str, &str)]) -> Reply {
    request(addr, "GET", path, headers).await
}

/// A directory with a page, standing in for the browser client.
fn client_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("openradlr-hosting-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("index.html"), "<!doctype html><title>client</title>").unwrap();
    dir
}

const SITE: &str = "https://example.org";
const WWW_SITE: &str = "https://www.example.org";
const PUBLIC_API: [&str; 4] = ["/api/info", "/api/route", "/api/map?id=none", "/api/studio"];

#[tokio::test]
async fn framing_is_forbidden_by_default() {
    let dir = client_dir("unframed");
    let addr = start_server(Config {
        static_dir: Some(dir.clone()),
        ..test_config()
    })
    .await;
    for path in ["/", "/api/info", "/healthz", "/no-such-file"] {
        let reply = get(addr, path, &[]).await;
        assert_eq!(reply.all("x-frame-options"), ["DENY"], "{path}");
        assert!(reply.csp().contains(&"frame-ancestors 'none'"), "{path}");
    }
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn listed_sites_may_frame_the_client() {
    let dir = client_dir("framed");
    let addr = start_server(Config {
        static_dir: Some(dir.clone()),
        frame_ancestors: vec![SITE.to_owned(), WWW_SITE.to_owned()],
        ..test_config()
    })
    .await;
    for path in ["/", "/api/info", "/healthz", "/no-such-file"] {
        let reply = get(addr, path, &[]).await;
        assert!(reply.all("x-frame-options").is_empty(), "{path}");
        let csp = reply.csp();
        assert_eq!(
            csp.iter()
                .filter(|d| d.starts_with("frame-ancestors"))
                .collect::<Vec<_>>(),
            [&"frame-ancestors https://example.org https://www.example.org"],
            "{path}"
        );
        // The rest of the policy and the other headers are as without framing.
        assert!(csp.contains(&"script-src 'self'") && csp.contains(&"object-src 'none'"));
        assert_eq!(reply.all("x-content-type-options"), ["nosniff"]);
        assert_eq!(reply.all("referrer-policy"), ["no-referrer"]);
    }
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn without_an_allow_list_no_cross_origin_header_is_sent() {
    let addr = start_server(test_config()).await;
    for path in PUBLIC_API {
        let reply = get(addr, path, &[("Origin", SITE)]).await;
        assert!(
            reply
                .headers
                .iter()
                .all(|(name, _)| !name.starts_with("access-control-")),
            "{path}: {:?}",
            reply.headers
        );
        // Only the compression's own `Vary: accept-encoding`.
        assert!(
            !reply.all("vary").join(", ").to_ascii_lowercase().contains("origin"),
            "{path}: {:?}",
            reply.all("vary")
        );
    }
    let preflight = request(
        addr,
        "OPTIONS",
        "/api/info",
        &[("Origin", SITE), ("Access-Control-Request-Method", "GET")],
    )
    .await;
    assert_eq!(preflight.status, 405);
    assert_eq!(preflight.header("access-control-allow-origin"), None);
}

#[tokio::test]
async fn listed_origins_may_read_the_public_api() {
    let addr = start_server(Config {
        allowed_origins: vec![SITE.to_owned(), WWW_SITE.to_owned()],
        ..test_config()
    })
    .await;
    for path in PUBLIC_API {
        for origin in [SITE, WWW_SITE] {
            let reply = get(addr, path, &[("Origin", origin)]).await;
            assert_eq!(reply.all("access-control-allow-origin"), [origin], "{path}");
            assert_eq!(
                reply.header("access-control-allow-credentials"),
                None,
                "{path}: cookies never cross origins"
            );
            assert!(
                reply.all("vary").join(", ").to_ascii_lowercase().contains("origin"),
                "{path}: caches must keep the answers of different origins apart"
            );
        }
    }
    let info = get(addr, "/api/info", &[("Origin", SITE)]).await;
    assert_eq!(info.status, 200);
    assert!(info.body.contains("\"protocol_version\""));
}

#[tokio::test]
async fn origins_are_matched_exactly() {
    let addr = start_server(Config {
        allowed_origins: vec![SITE.to_owned()],
        ..test_config()
    })
    .await;
    for origin in [
        "https://evil.example",
        "http://example.org",
        "https://example.org:8443",
        "https://example.org.evil.example",
        "https://sub.example.org",
        "https://example.org/",
        "https://EXAMPLE.org",
        "null",
        "*",
    ] {
        let reply = get(addr, "/api/info", &[("Origin", origin)]).await;
        assert_eq!(reply.status, 200, "{origin}: the page is public anyway");
        assert_eq!(reply.header("access-control-allow-origin"), None, "{origin}");
        assert!(
            reply.all("vary").join(", ").to_ascii_lowercase().contains("origin"),
            "{origin}"
        );
    }
    // Without an Origin header (a visit, curl) nothing is added either.
    let plain = get(addr, "/api/info", &[]).await;
    assert_eq!(plain.header("access-control-allow-origin"), None);
}

#[tokio::test]
async fn preflights_are_answered() {
    let addr = start_server(Config {
        allowed_origins: vec![SITE.to_owned()],
        ..test_config()
    })
    .await;
    let ask = |origin: &'static str| async move {
        request(
            addr,
            "OPTIONS",
            "/api/info",
            &[("Origin", origin), ("Access-Control-Request-Method", "GET")],
        )
        .await
    };
    let allowed = ask(SITE).await;
    assert_eq!(allowed.status, 200);
    assert_eq!(allowed.all("access-control-allow-origin"), [SITE]);
    assert_eq!(allowed.all("access-control-allow-methods"), ["GET"]);
    assert_eq!(allowed.all("access-control-max-age"), ["600"]);
    assert_eq!(allowed.header("access-control-allow-credentials"), None);
    assert_eq!(allowed.header("access-control-allow-headers"), None);
    assert!(allowed.body.is_empty());

    let foreign = ask("https://evil.example").await;
    assert_eq!(foreign.header("access-control-allow-origin"), None);
}

#[tokio::test]
async fn only_the_public_api_answers_cross_origin_requests() {
    let dir = client_dir("cors");
    let addr = start_server(Config {
        static_dir: Some(dir.clone()),
        allowed_origins: vec![SITE.to_owned()],
        ..test_config()
    })
    .await;
    for path in [
        "/",
        "/healthz",
        "/internal/metrics",
        "/api/me",
        "/auth/strava",
        "/api/strava/upload/1",
    ] {
        let reply = get(addr, path, &[("Origin", SITE)]).await;
        assert!(
            reply
                .headers
                .iter()
                .all(|(name, _)| !name.starts_with("access-control-")),
            "{path}: {:?}",
            reply.headers
        );
    }
    let preflight = request(
        addr,
        "OPTIONS",
        "/api/me",
        &[("Origin", SITE), ("Access-Control-Request-Method", "GET")],
    )
    .await;
    assert_eq!(preflight.status, 405);
    let _ = std::fs::remove_dir_all(dir);
}

/// Opens a game connection with extra request headers (a name may repeat);
/// `Err` is the HTTP status the server refused it with.
async fn open_game(addr: SocketAddr, headers: &[(&'static str, &str)]) -> Result<Socket, u16> {
    let mut request = format!("ws://{addr}/ws").into_client_request().unwrap();
    for (name, value) in headers {
        request
            .headers_mut()
            .append(HeaderName::from_static(name), value.parse().unwrap());
    }
    match connect_async(request).await {
        Ok((socket, _)) => Ok(socket),
        Err(WsError::Http(response)) => Err(response.status().as_u16()),
        Err(other) => panic!("unexpected failure: {other}"),
    }
}

/// One connection per address, and the address comes from `Fly-Client-IP`.
fn behind_a_platform_proxy() -> Config {
    Config {
        max_connections_per_ip: 1,
        client_ip_header: Some(HeaderName::from_static("fly-client-ip")),
        ..test_config()
    }
}

const TOO_MANY: u16 = 429;

#[tokio::test]
async fn the_platform_header_tells_riders_behind_one_proxy_apart() {
    let addr = start_server(behind_a_platform_proxy()).await;
    // Every connection comes from the same peer (the proxy; here 127.0.0.1).
    let _anna = open_game(addr, &[("fly-client-ip", "203.0.113.9")]).await.unwrap();
    let _ben = open_game(addr, &[("fly-client-ip", "198.51.100.7")]).await.unwrap();
    let _cleo = open_game(addr, &[("fly-client-ip", "2001:db8::1")]).await.unwrap();
    assert_eq!(
        open_game(addr, &[("fly-client-ip", "203.0.113.9")]).await.err(),
        Some(TOO_MANY),
        "the limit counts per reported address"
    );
    // The same address, written as an IPv4-mapped IPv6 address.
    assert_eq!(
        open_game(addr, &[("fly-client-ip", "::ffff:198.51.100.7")]).await.err(),
        Some(TOO_MANY)
    );
}

#[tokio::test]
async fn the_limit_frees_up_when_the_connection_closes() {
    let addr = start_server(behind_a_platform_proxy()).await;
    let anna = open_game(addr, &[("fly-client-ip", "203.0.113.9")]).await.unwrap();
    drop(anna);
    let again = async {
        loop {
            if let Ok(socket) = open_game(addr, &[("fly-client-ip", "203.0.113.9")]).await {
                return socket;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    };
    tokio::time::timeout(std::time::Duration::from_secs(5), again)
        .await
        .expect("the address may connect again");
}

#[tokio::test]
async fn x_forwarded_for_cannot_dodge_the_platform_header() {
    for trust_proxy in [false, true] {
        let addr = start_server(Config {
            trust_proxy,
            ..behind_a_platform_proxy()
        })
        .await;
        let _first = open_game(
            addr,
            &[("fly-client-ip", "203.0.113.9"), ("x-forwarded-for", "192.0.2.1")],
        )
        .await
        .unwrap();
        // The same client claims to be somebody else in the header it controls.
        assert_eq!(
            open_game(
                addr,
                &[("fly-client-ip", "203.0.113.9"), ("x-forwarded-for", "192.0.2.2")]
            )
            .await
            .err(),
            Some(TOO_MANY),
            "trust_proxy={trust_proxy}"
        );
    }
}

#[tokio::test]
async fn an_unusable_platform_header_counts_as_the_peer() {
    let addr = start_server(behind_a_platform_proxy()).await;
    // No header (not through the proxy): the peer address, as without the setting.
    let _direct = open_game(addr, &[]).await.unwrap();
    assert_eq!(open_game(addr, &[]).await.err(), Some(TOO_MANY));
    // Garbage, a list, or the header twice (one sent by the client, one added
    // by a proxy that appends): all share the peer's single slot.
    for headers in [
        vec![("fly-client-ip", "garbage")],
        vec![("fly-client-ip", "203.0.113.9, 198.51.100.7")],
        vec![("fly-client-ip", "198.51.100.7"), ("fly-client-ip", "203.0.113.9")],
        vec![("fly-client-ip", "")],
    ] {
        assert_eq!(open_game(addr, &headers).await.err(), Some(TOO_MANY), "{headers:?}");
    }
    // A proper value still gets its own slot.
    open_game(addr, &[("fly-client-ip", "203.0.113.9")]).await.unwrap();
}

#[tokio::test]
async fn an_unusable_platform_header_falls_back_to_the_trusted_proxy_header() {
    let addr = start_server(Config {
        trust_proxy: true,
        ..behind_a_platform_proxy()
    })
    .await;
    let _first = open_game(addr, &[("x-forwarded-for", "192.0.2.1")]).await.unwrap();
    let _second = open_game(addr, &[("x-forwarded-for", "192.0.2.2")]).await.unwrap();
    assert_eq!(
        open_game(addr, &[("x-forwarded-for", "192.0.2.1")]).await.err(),
        Some(TOO_MANY)
    );
}

#[tokio::test]
async fn the_platform_header_means_nothing_unless_configured() {
    let addr = start_server(Config {
        max_connections_per_ip: 1,
        ..test_config()
    })
    .await;
    let _first = open_game(addr, &[("fly-client-ip", "203.0.113.9")]).await.unwrap();
    // A client that invents addresses is still one peer.
    assert_eq!(
        open_game(addr, &[("fly-client-ip", "198.51.100.7")]).await.err(),
        Some(TOO_MANY)
    );
}
