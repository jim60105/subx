# Design

## Context

Approved design: `docs/superpowers/specs/2026-11-25-sync-preview-design.md`, sections "Why not the asset protocol", "Backend units" and "Media server".

Observed in the code:

- Commands are declared once in `bindings.rs::specta_builder` and mirrored in `ipc_tests.rs::COMMANDS` (currently `[&str; 22]`).
- `commands/sync.rs::load_subtitle(&Path)` is the loader apply uses; it is private, and `FormatManager` is neither `Send` nor `Sync`.
- `hyper` 1.12, `hyper-util` 0.1.21, `http-body-util` 0.1.5 and `getrandom` 0.4.3 are already in `Cargo.lock`. Hyper's `server` feature is enabled today only through a dev-dependency.
- `App::run` ends the process without dropping managed state, so exit cleanup needs an explicit hook.

## Goals / Non-Goals

**Goals:** a seekable URL for one media file at a time; cue data; cleanup on close, replacement and exit.

**Non-Goals:** audio decoding (`add-sync-audio-fallback`), any UI, waveform, CORS, HTTPS, configuration of the port.

## Decisions

### D1 Loopback HTTP, not the asset protocol

Tauri's `asset:` protocol and `convertFileSrc` are not used for media, on any platform.

- https://github.com/tauri-apps/tauri/issues/3725, "Loading a video/audio as an asset does not work", has been open since 2022-03-17 and was still open on 2026-11-25. A maintainer reproduced it and attributed it to webkit2gtk. Another maintainer stated that local media through `convertFileSrc` has "No fix available right now", even with GStreamer installed. The upstream bug is https://bugs.webkit.org/show_bug.cgi?id=146351.
- https://github.com/tauri-apps/tauri/pull/14402, which added a GStreamer handler for `asset://`, was closed without being merged.
- The failure class was reproduced locally on WebKitGTK 2.54.2: the same MP4 failed with media error 4 through a registered custom scheme and played over loopback HTTP. The probe registered its own scheme; it did not run Tauri's handler.
- A maintainer reports no such issue on Windows and macOS. One delivery path is still used everywhere: a second one would need its own range, scope and lifetime handling, and the Linux path would remain mandatory.

A `blob:` URL is rejected because it would load a multi-gigabyte file into memory.

Evidence limits: the probe was Linux WebKitGTK only, over loopback HTTP with ranges, with playback muted. Audible output, Windows, macOS, Flatpak and AppImage are unverified.

### D2 Dependencies (`src-tauri/Cargo.toml`)

```toml
hyper = { version = "1", features = ["server", "http1"] }
hyper-util = { version = "0.1", features = ["tokio"] }
http-body-util = { version = "0.1", features = ["channel"] }
getrandom = "0.4"
```

`tokio` features become `["sync", "rt", "net", "fs", "io-util", "macros", "time"]`. Expected lockfile effect: no new package and no version change.

### D3 `src-tauri/src/media_server.rs`

```rust
pub struct MediaServer { /* addr, Arc<Registry>, accept-loop AbortHandle */ }
pub struct Published { pub token: String, pub url: String }

impl MediaServer {
    /// Must be called inside a tokio runtime.
    pub fn start() -> std::io::Result<Self>;
    pub fn addr(&self) -> std::net::SocketAddr;
    /// Registry insert only; no file-system access.
    pub fn publish(&self, path: PathBuf) -> std::io::Result<Published>;
    /// Removes the entry; the caller drops the returned value outside any lock.
    #[must_use]
    pub fn revoke(&self, token: &str) -> Option<Entry>;
}
impl Drop for MediaServer { /* abort the accept loop; dropping the registry's senders ends streams */ }

pub(crate) enum RangeOutcome { Full, Partial { start: u64, end: u64 }, Unsatisfiable }
pub(crate) fn parse_range(header: Option<&str>, len: u64) -> RangeOutcome;
pub(crate) fn content_type_of(path: &Path) -> &'static str;
```

- `start`: `std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))`, `set_nonblocking(true)`, `tokio::net::TcpListener::from_std`, then `tokio::spawn` the accept loop. Each connection: `hyper::server::conn::http1::Builder::new().timer(TokioTimer::new())` over `TokioIo`. A connection error is ignored; an accept error is followed by a 50 ms sleep.
- `Registry`: `std::sync::Mutex<HashMap<String, Entry>>`; `Entry { path, content_type, revoked: tokio::sync::watch::Sender<bool> }`. The registry lives behind the server; connections hold a `Weak<Registry>` so that dropping the server ends every stream. The lock is never held across `.await`. `revoke` removes the entry, calls `send_replace(true)` and returns it; a `changed()` error (sender dropped) also counts as revoked.
- Token: 16 bytes from `getrandom::fill`, lowercase hex (32 characters). URL: `http://127.0.0.1:<port>/<token>`. A `getrandom` failure maps to `io::Error::other`.
- `pub fn check_file(path: &Path) -> io::Result<()>` (free function, blocking): `std::fs::metadata` first, `is_file()` else `ErrorKind::InvalidInput`, and only then `File::open`, so a FIFO is never opened. `publish` does not touch the file system. Each request reopens the path and re-checks `is_file()`; failure is 404.
- Check order per request: `Host` must equal `127.0.0.1:<port>` exactly (else 403) → method must be GET or HEAD (else 405 with `Allow: GET, HEAD`) → the path must be `/` plus a known token and there must be no query (else 404) → range.
- `HEAD` ignores `Range` (RFC 9110 defines it for GET) and answers 200.
- Every success carries `Content-Type`, `Content-Length`, `Accept-Ranges: bytes`, `Cache-Control: no-store`. Every error carries `Cache-Control: no-store` and an empty body. No `Access-Control-*` header is ever sent.
- `parse_range`: only `bytes=` with one spec, ASCII digits only. `a-b` with `a > b`, a non-digit, an overflow, an empty spec or a comma → `Full`. `a >= len`, or `-0`, or any valid spec on an empty file → `Unsatisfiable`. Treating an overflowing number as `Full` is deliberate. `b` is clamped to `len - 1`; `-n` with `n > len` is the whole file as `Partial { 0, len - 1 }`.
- Body: `http_body_util::channel::Channel<Bytes, io::Error>` with capacity 2 (use `hyper::body::Bytes`, no direct `bytes` dependency), fed by a task reading 64 KiB chunks with `tokio::fs`. Each send and each read is raced with `revoked.changed()` in `tokio::select!`; on revocation (or a dropped sender) call `Sender::abort`. A client that goes away ends the task through the send error.
- `content_type_of`, by lowercase extension: `mp4 m4v`→`video/mp4`, `mov`→`video/quicktime`, `mkv`→`video/x-matroska`, `webm`→`video/webm`, `avi`→`video/x-msvideo`, `mp3`→`audio/mpeg`, `m4a`→`audio/mp4`, `aac`→`audio/aac`, `flac`→`audio/flac`, `ogg oga opus`→`audio/ogg`, `wav`→`audio/wav`, else `application/octet-stream`. The URL has no extension, so some WebViews need the type.
- Neither tokens nor URLs are logged.

### D4 Session state (`state.rs`)

```rust
#[derive(Default)]
pub struct PreviewState { inner: std::sync::Mutex<PreviewInner> }
#[derive(Default)]
struct PreviewInner { server: Option<MediaServer>, session: Option<PreviewSession> }
struct PreviewSession { id: String, media_path: PathBuf, media_token: String }

impl PreviewState {
    pub fn open(&self, media: PathBuf) -> Result<PreviewSessionDto, ErrorDto>;
    pub fn close(&self, session_id: &str);
    pub fn shutdown(&self);
}
```

- Id: `preview-<n>` from a module `AtomicU64`.
- The lock is never held across a file-system or network call other than binding the loopback socket: a stat stuck on a network mount must not block `close` or the exit hook.
- `open`, in this order: `check_file` without the lock (`preview.media_unreadable`); then under the lock start the server if absent (`preview.server_unavailable`), publish, swap the session, revoke the old token. A failure leaves an open session untouched. Split it as `open` = `open_with(media, check_file)`, where the second argument is `impl FnOnce(&Path) -> io::Result<()>`, as a test seam.
- `close`, `shutdown` and later accessors only change memory under the lock; anything that deletes a file is moved out of the lock and dropped after it.
- `open` runs on `tokio::task::spawn_blocking` from the command, because metadata on a network mount can block. `spawn_blocking` threads keep the runtime context, so `MediaServer::start` works there.
- `close` with a non-matching id does nothing. `shutdown` drops session and server.
- `AppState` gains `preview_state: Arc<PreviewState>` and the accessor `preview_state()`.
- A poisoned mutex is recovered with `unwrap_or_else(PoisonError::into_inner)`.

### D5 Commands (`commands/preview.rs`)

```rust
load_preview_cues(subtitle_path: String) -> Result<Vec<PreviewCueDto>, ErrorDto>
open_preview(media_path: String, state) -> Result<PreviewSessionDto, ErrorDto>
close_preview(session_id: String, state) -> Result<(), ErrorDto>
```

DTOs in `dto.rs` (`Serialize, Type`, camelCase): `PreviewCueDto { start_ms: u32, end_ms: u32, text: String }`, `PreviewSessionDto { session_id: String, url: String }`. Times are `as_millis` saturated to `u32::MAX`. `load_preview_cues` runs in `spawn_blocking` and calls `commands::sync::load_subtitle`, made `pub(crate)` and otherwise unchanged. A panicked blocking task maps to `core.other`.

Codes are literal constants in `commands/preview.rs`: `CODE_MEDIA_UNREADABLE = "preview.media_unreadable"`, `CODE_SERVER_UNAVAILABLE = "preview.server_unavailable"`. No hint codes.

### D6 Exit

`lib.rs` replaces `.run(generate_context!())` with `.build(generate_context!())` and `.run(|app, event| if let tauri::RunEvent::Exit = event { app.state::<AppState>().preview_state().shutdown(); })`, importing `tauri::Manager`.

### D7 CSP and parity

`tauri.conf.json`: insert `media-src 'self' http://127.0.0.1:*; ` before `object-src`. CSP cannot name a random port; the token is what authorizes access. `backendCodeParity.test.ts`: add `preview` to the prefix alternation and one assertion that both codes are found. `scripts/release-config.test.ts` is not used; the CSP test is a new `scripts/csp-config.test.ts` reading `tauri.conf.json`.

## Risks / Trade-offs

- [Any local process can reach the port] → nothing is served without a 128-bit token; `Host` is checked; no CORS.
- [Two opens in flight finish in either order] → the last to take the lock wins and the other's URL is 404; the frontend serializes calls (`add-sync-preview-player`).
- [WKWebView or WebView2 may treat loopback HTTP as mixed content] → unverified; the later player reports `unavailable`. The asset protocol is not a fallback.
