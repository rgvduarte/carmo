//! End-to-end test: a client that joins and then stops reading (a frozen tab,
//! a phone that lost its network without closing the socket) is closed, and
//! the riders next to it notice nothing.

use futures_util::{SinkExt, StreamExt};
use openradlr_server::app;
use openradlr_server::config::{Config, EventsSetting};
use serde_json::Value;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpSocket, TcpStream};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{client_async, WebSocketStream};

type Socket = WebSocketStream<TcpStream>;

const ROUTES_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../routes");

/// Small socket buffers on both sides, so a client that stops reading stalls
/// the server's writer after a few kilobytes instead of a few megabytes.
const SMALL_BUFFER: u32 = 4096;

fn test_config() -> Config {
    Config {
        route_file: PathBuf::from(ROUTES_DIR).join("rolling-hills.json"),
        // Bots make every state message a few kilobytes.
        target_riders: 60,
        bot_seed: Some(1),
        events: EventsSetting::Off,
        max_players: 2,
        grace_s: 0.0,
        write_timeout_s: 0.5,
        ..Config::default()
    }
}

async fn start_server(config: Config) -> SocketAddr {
    let router = app::build(&config).expect("app builds");
    let socket = TcpSocket::new_v4().unwrap();
    // Accepted connections inherit the listener's buffer size.
    socket.set_send_buffer_size(SMALL_BUFFER).unwrap();
    socket.bind("127.0.0.1:0".parse().unwrap()).unwrap();
    let listener = socket.listen(64).unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    addr
}

async fn connect(addr: SocketAddr) -> Socket {
    let socket = TcpSocket::new_v4().unwrap();
    socket.set_recv_buffer_size(SMALL_BUFFER).unwrap();
    let stream = socket.connect(addr).await.unwrap();
    let (socket, _) = client_async(format!("ws://{addr}/ws"), stream)
        .await
        .expect("websocket connects");
    socket
}

/// Reads messages until one of the given type arrives.
async fn expect_type(socket: &mut Socket, wanted: &str) -> Value {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let message = socket.next().await.expect("socket open").expect("valid frame");
            let Message::Text(text) = message else { continue };
            let value: Value = serde_json::from_str(text.as_str()).expect("server sends JSON");
            if value["type"] == wanted {
                return value;
            }
        }
    })
    .await
    .unwrap_or_else(|_| panic!("no {wanted} message in time"))
}

async fn join(addr: SocketAddr, name: &str) -> Socket {
    let mut socket = connect(addr).await;
    socket
        .send(Message::text(r#"{"type":"hello","protocol_version":2}"#))
        .await
        .unwrap();
    expect_type(&mut socket, "welcome").await;
    socket
        .send(Message::text(format!(
            r#"{{"type":"join","name":"{name}","weight_kg":70}}"#
        )))
        .await
        .unwrap();
    expect_type(&mut socket, "joined").await;
    socket
}

async fn players(addr: SocketAddr) -> u64 {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    stream
        .write_all(b"GET /api/info HTTP/1.1\r\nHost: test\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).await.unwrap();
    let body = response.split_once("\r\n\r\n").expect("a body").1;
    serde_json::from_str::<Value>(body).unwrap()["players"]
        .as_u64()
        .unwrap()
}

#[tokio::test]
async fn a_client_that_stops_reading_is_closed_and_frees_its_seat() {
    let addr = start_server(test_config()).await;
    let mut healthy = join(addr, "Anna").await;
    // Ben joins and from here on reads nothing; his socket stays open.
    let mut frozen = join(addr, "Ben").await;
    assert_eq!(players(addr).await, 2);

    // Anna keeps getting her states at the usual rate (4 per second) while
    // the server finds out about Ben, and long after.
    let started = Instant::now();
    let mut states = 0;
    let mut gone = false;
    while started.elapsed() < Duration::from_secs(4) {
        expect_type(&mut healthy, "state").await;
        states += 1;
        if !gone && states % 4 == 0 {
            gone = players(addr).await == 1;
        }
    }
    assert!(states >= 12, "only {states} states in 4 s next to a frozen client");
    assert!(gone, "the frozen rider is still counted after 4 s");

    // Both seats were taken; Ben's is free again.
    let mut cleo = join(addr, "Cleo").await;
    expect_type(&mut cleo, "state").await;

    // Ben's socket was closed by the server: what was in flight arrives, then it ends.
    let ended = tokio::time::timeout(Duration::from_secs(5), async {
        while let Some(Ok(_)) = frozen.next().await {}
    })
    .await;
    assert!(ended.is_ok(), "the frozen client's connection is still open");
}

#[tokio::test]
async fn a_client_that_reads_is_never_closed_for_being_slow_to_write_to() {
    // The same short timeout, but the client reads: several timeouts pass and it stays.
    let addr = start_server(test_config()).await;
    let mut anna = join(addr, "Anna").await;
    let started = Instant::now();
    let mut last_tick = 0;
    while started.elapsed() < Duration::from_secs(2) {
        let state = expect_type(&mut anna, "state").await;
        let tick = state["tick"].as_u64().unwrap();
        assert!(tick > last_tick, "states arrive in order");
        last_tick = tick;
    }
    assert_eq!(players(addr).await, 1);
}
