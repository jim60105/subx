//! Loopback HTTP server for the sync preview's media (design D1, D3).
//!
//! WebKitGTK cannot play media through a custom URI scheme
//! (tauri-apps/tauri#3725), so the preview's `<video>`/`<audio>` element reads
//! the selected file over plain HTTP on `127.0.0.1`. Nothing is served by path:
//! the backend publishes one file under a random 128-bit token, and a request
//! can only name a token. The `Host` check keeps DNS-rebinding pages out, and no
//! CORS header is ever sent, so another origin cannot read the bytes either.
//!
//! Neither tokens nor URLs are logged anywhere in this module.

use std::collections::HashMap;
use std::convert::Infallible;
use std::ffi::OsStr;
use std::io::{self, SeekFrom};
use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, Weak};
use std::time::Duration;

use http_body_util::channel::{Channel, Sender};
use http_body_util::combinators::BoxBody;
use http_body_util::{BodyExt, Empty};
use hyper::body::Bytes;
use hyper::header::{self, HeaderValue};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::{TokioIo, TokioTimer};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::watch;
use tokio::task::AbortHandle;

/// Bytes read from disk per body frame.
const CHUNK: usize = 64 * 1024;
/// Frames buffered between the file reader and hyper; small on purpose, so a
/// revocation leaves little already-queued data to deliver.
const CHANNEL_CAPACITY: usize = 2;

type Body = BoxBody<Bytes, io::Error>;

/// A running loopback media server. Dropping it stops accepting and ends every
/// running stream.
pub struct MediaServer {
    addr: SocketAddr,
    registry: Arc<Registry>,
    accept: AbortHandle,
}

/// A published file's token and the URL the WebView loads it from.
pub struct Published {
    pub token: String,
    pub url: String,
}

/// One published file.
///
/// Returned by [`MediaServer::revoke`] so the caller decides where it is
/// dropped: a later change attaches temporary files to an entry, and deleting
/// those must happen outside any lock (design D4).
pub struct Entry {
    path: PathBuf,
    content_type: &'static str,
    revoked: watch::Sender<bool>,
}

/// The published files, keyed by token.
///
/// The server owns the only strong reference. Connections hold a `Weak`, so
/// dropping the server drops every entry's sender, which ends every stream.
#[derive(Default)]
struct Registry {
    entries: Mutex<HashMap<String, Entry>>,
}

impl Registry {
    /// Never held across an `.await`.
    fn lock(&self) -> MutexGuard<'_, HashMap<String, Entry>> {
        self.entries.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// What a request needs from a published entry. The revocation receiver is
    /// subscribed under the lock, while the entry is still present: `revoke`
    /// removes the entry under the same lock before signalling, so a request
    /// either misses the entry or observes its revocation.
    fn lookup(&self, token: &str) -> Option<(PathBuf, &'static str, watch::Receiver<bool>)> {
        self.lock().get(token).map(|entry| {
            (
                entry.path.clone(),
                entry.content_type,
                entry.revoked.subscribe(),
            )
        })
    }
}

impl MediaServer {
    /// Binds `127.0.0.1` on an OS-chosen port and starts accepting.
    ///
    /// Must be called inside a tokio runtime; outside one it fails rather than
    /// panicking, so the caller can report `preview.server_unavailable`.
    pub fn start() -> io::Result<Self> {
        let runtime = tokio::runtime::Handle::try_current().map_err(io::Error::other)?;
        let listener = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        listener.set_nonblocking(true)?;
        let addr = listener.local_addr()?;
        let listener = {
            let _context = runtime.enter();
            tokio::net::TcpListener::from_std(listener)?
        };

        let registry = Arc::new(Registry::default());
        let accept = runtime
            .spawn(accept_loop(
                listener,
                Arc::downgrade(&registry),
                addr.port(),
            ))
            .abort_handle();

        Ok(Self {
            addr,
            registry,
            accept,
        })
    }

    pub fn addr(&self) -> SocketAddr {
        self.addr
    }

    /// Publishes `path` under a fresh token. Registry insert only; no
    /// file-system access, so a slow mount cannot stall the caller's lock.
    pub fn publish(&self, path: PathBuf) -> io::Result<Published> {
        let token = new_token()?;
        let (revoked, _) = watch::channel(false);
        let entry = Entry {
            content_type: content_type_of(&path),
            path,
            revoked,
        };
        self.registry.lock().insert(token.clone(), entry);
        Ok(Published {
            url: format!("http://127.0.0.1:{}/{token}", self.addr.port()),
            token,
        })
    }

    /// Removes the entry and signals its running streams to stop. The caller
    /// drops the returned value outside any lock.
    #[must_use]
    pub fn revoke(&self, token: &str) -> Option<Entry> {
        let entry = self.registry.lock().remove(token)?;
        entry.revoked.send_replace(true);
        Some(entry)
    }
}

impl Drop for MediaServer {
    fn drop(&mut self) {
        // The listener lives in the accept task, so aborting it closes the port.
        // The registry (and with it every revocation sender) drops right after,
        // which ends the running streams.
        self.accept.abort();
    }
}

/// Whether `path` is a readable regular file. Blocking.
///
/// The type is checked before opening, so a FIFO is never opened (opening one
/// blocks until a writer appears).
pub fn check_file(path: &Path) -> io::Result<()> {
    let metadata = std::fs::metadata(path)?;
    if !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "not a regular file",
        ));
    }
    std::fs::File::open(path).map(drop)
}

/// 16 random bytes as 32 lowercase hex digits.
fn new_token() -> io::Result<String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(io::Error::other)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

async fn accept_loop(listener: tokio::net::TcpListener, registry: Weak<Registry>, port: u16) {
    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let registry = registry.clone();
                tokio::spawn(async move {
                    let service = service_fn(move |request| {
                        let registry = registry.clone();
                        async move { Ok::<_, Infallible>(respond(request, &registry, port).await) }
                    });
                    // A broken connection only concerns its own client.
                    let _ = http1::Builder::new()
                        .timer(TokioTimer::new())
                        .serve_connection(TokioIo::new(stream), service)
                        .await;
                });
            }
            // Typically fd exhaustion; back off instead of spinning.
            Err(_) => tokio::time::sleep(Duration::from_millis(50)).await,
        }
    }
}

/// Answers one request. Checks run in the order D3 fixes: host, method, token,
/// then range.
async fn respond<B>(request: Request<B>, registry: &Weak<Registry>, port: u16) -> Response<Body> {
    let expected_host = format!("127.0.0.1:{port}");
    let host = request
        .headers()
        .get(header::HOST)
        .map(HeaderValue::as_bytes);
    if host != Some(expected_host.as_bytes()) {
        return status_only(StatusCode::FORBIDDEN);
    }

    let head = match *request.method() {
        Method::GET => false,
        Method::HEAD => true,
        _ => {
            let mut response = status_only(StatusCode::METHOD_NOT_ALLOWED);
            response
                .headers_mut()
                .insert(header::ALLOW, HeaderValue::from_static("GET, HEAD"));
            return response;
        }
    };

    // Only `/<token>` names anything; a query, a nested path or a file path
    // never matches a token.
    let token = match (
        request.uri().query(),
        request.uri().path().strip_prefix('/'),
    ) {
        (None, Some(token)) => token,
        _ => return status_only(StatusCode::NOT_FOUND),
    };
    let Some((path, content_type, revoked)) = registry
        .upgrade()
        .and_then(|registry| registry.lookup(token))
    else {
        return status_only(StatusCode::NOT_FOUND);
    };

    // Re-checked per request: the file may have been replaced since publish.
    let metadata = match tokio::fs::metadata(&path).await {
        Ok(metadata) if metadata.is_file() => metadata,
        _ => return status_only(StatusCode::NOT_FOUND),
    };
    let Ok(file) = tokio::fs::File::open(&path).await else {
        return status_only(StatusCode::NOT_FOUND);
    };
    let len = metadata.len();

    // RFC 9110 defines `Range` for GET only.
    if head {
        return success(StatusCode::OK, content_type, len, empty());
    }

    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok());
    match parse_range(range, len) {
        RangeOutcome::Full => success(
            StatusCode::OK,
            content_type,
            len,
            stream(file, 0, len, revoked),
        ),
        RangeOutcome::Partial { start, end } => {
            let length = end - start + 1;
            let mut response = success(
                StatusCode::PARTIAL_CONTENT,
                content_type,
                length,
                stream(file, start, length, revoked),
            );
            response.headers_mut().insert(
                header::CONTENT_RANGE,
                ascii_header(format!("bytes {start}-{end}/{len}")),
            );
            response
        }
        RangeOutcome::Unsatisfiable => {
            let mut response = status_only(StatusCode::RANGE_NOT_SATISFIABLE);
            response.headers_mut().insert(
                header::CONTENT_RANGE,
                ascii_header(format!("bytes */{len}")),
            );
            response
        }
    }
}

fn empty() -> Body {
    Empty::new().map_err(|never| match never {}).boxed()
}

fn ascii_header(value: String) -> HeaderValue {
    HeaderValue::try_from(value).expect("a formatted range header is visible ASCII")
}

/// An error response: no body, never cached.
fn status_only(status: StatusCode) -> Response<Body> {
    let mut response = Response::new(empty());
    *response.status_mut() = status;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

/// A successful response. The URL carries no extension, so `Content-Type` is
/// what tells the WebView how to decode the bytes.
fn success(
    status: StatusCode,
    content_type: &'static str,
    length: u64,
    body: Body,
) -> Response<Body> {
    let mut response = status_only(status);
    *response.body_mut() = body;
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from(length));
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    response
}

/// A body streaming `length` bytes of `file` from `start`.
fn stream(file: tokio::fs::File, start: u64, length: u64, revoked: watch::Receiver<bool>) -> Body {
    let (sender, body) = Channel::<Bytes, io::Error>::new(CHANNEL_CAPACITY);
    tokio::spawn(pump(file, start, length, revoked, sender));
    body.boxed()
}

/// Feeds the body channel, racing every read and every send against
/// revocation.
///
/// Aborting the channel is what makes hyper drop the connection short of the
/// announced `Content-Length`. It is only noticed when hyper next polls the
/// body, so a client that has stopped reading keeps its connection until it
/// reads again or goes away; the frames already queued are delivered first.
async fn pump(
    mut file: tokio::fs::File,
    start: u64,
    mut remaining: u64,
    mut revoked: watch::Receiver<bool>,
    mut sender: Sender<Bytes, io::Error>,
) {
    if let Err(err) = file.seek(SeekFrom::Start(start)).await {
        return sender.abort(err);
    }
    let mut buffer = vec![0u8; CHUNK];
    while remaining > 0 {
        let want = remaining.min(CHUNK as u64) as usize;
        // The only transition is false → true, and a dropped sender (server
        // gone) is an error: either way `changed()` resolving means stop.
        let read = tokio::select! {
            biased;
            _ = revoked.changed() => None,
            read = file.read(&mut buffer[..want]) => Some(read),
        };
        let read = match read {
            None => return sender.abort(revoked_error()),
            // The file shrank under us; ending cleanly would pass a short body
            // off as complete.
            Some(Ok(0)) => {
                return sender.abort(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "the file shrank while it was being served",
                ))
            }
            Some(Ok(read)) => read,
            Some(Err(err)) => return sender.abort(err),
        };

        let chunk = Bytes::copy_from_slice(&buffer[..read]);
        let sent = tokio::select! {
            biased;
            _ = revoked.changed() => None,
            sent = sender.send_data(chunk) => Some(sent),
        };
        match sent {
            None => return sender.abort(revoked_error()),
            Some(Ok(())) => remaining -= read as u64,
            // The client went away.
            Some(Err(_)) => return,
        }
    }
}

fn revoked_error() -> io::Error {
    io::Error::other("the media was revoked")
}

/// How a request's `Range` header is answered.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum RangeOutcome {
    Full,
    Partial { start: u64, end: u64 },
    Unsatisfiable,
}

/// Interprets a `Range` header for a file of `len` bytes (design D3).
///
/// Only one `bytes=` spec of ASCII digits is honoured; anything else is served
/// whole, which RFC 9110 allows. An overflowing number is treated as malformed
/// on purpose, rather than clamped.
pub(crate) fn parse_range(header: Option<&str>, len: u64) -> RangeOutcome {
    let Some(spec) = header.and_then(|header| header.strip_prefix("bytes=")) else {
        return RangeOutcome::Full;
    };
    if spec.contains(',') {
        return RangeOutcome::Full;
    }
    let Some((first, last)) = spec.split_once('-') else {
        return RangeOutcome::Full;
    };

    match (number(first), number(last)) {
        // `-n`: the last n bytes.
        (Number::Absent, Number::Valid(suffix)) => {
            if suffix == 0 || len == 0 {
                RangeOutcome::Unsatisfiable
            } else {
                RangeOutcome::Partial {
                    start: len.saturating_sub(suffix),
                    end: len - 1,
                }
            }
        }
        // `a-` and `a-b`.
        (Number::Valid(start), last @ (Number::Absent | Number::Valid(_))) => {
            let end = match last {
                Number::Valid(end) if end < start => return RangeOutcome::Full,
                Number::Valid(end) => Some(end),
                _ => None,
            };
            if start >= len {
                RangeOutcome::Unsatisfiable
            } else {
                RangeOutcome::Partial {
                    start,
                    end: end.map_or(len - 1, |end| end.min(len - 1)),
                }
            }
        }
        _ => RangeOutcome::Full,
    }
}

enum Number {
    Absent,
    Valid(u64),
    Invalid,
}

fn number(text: &str) -> Number {
    if text.is_empty() {
        Number::Absent
    } else if !text.bytes().all(|byte| byte.is_ascii_digit()) {
        Number::Invalid
    } else {
        text.parse().map_or(Number::Invalid, Number::Valid)
    }
}

/// The MIME type for a media file, by lowercase extension.
pub(crate) fn content_type_of(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("mp4" | "m4v") => "video/mp4",
        Some("mov") => "video/quicktime",
        Some("mkv") => "video/x-matroska",
        Some("webm") => "video/webm",
        Some("avi") => "video/x-msvideo",
        Some("mp3") => "audio/mpeg",
        Some("m4a") => "audio/mp4",
        Some("aac") => "audio/aac",
        Some("flac") => "audio/flac",
        Some("ogg" | "oga" | "opus") => "audio/ogg",
        Some("wav") => "audio/wav",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    use super::test_http::{self, Reply};
    use super::*;

    const LARGE: u64 = 64 * 1024 * 1024;

    fn hundred_bytes() -> Vec<u8> {
        (0..100u8).collect()
    }

    /// A started server publishing `content` as `name` in a fresh directory.
    fn serve(content: &[u8], name: &str) -> (MediaServer, Published, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join(name);
        fs::write(&path, content).expect("the fixture must be written");
        let server = MediaServer::start().expect("the server must start");
        let published = server.publish(path).expect("publishing must succeed");
        (server, published, dir)
    }

    fn sparse(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        fs::File::create(&path)
            .and_then(|file| file.set_len(LARGE))
            .expect("the sparse fixture must be created");
        path
    }

    fn host_of(server: &MediaServer) -> String {
        format!("127.0.0.1:{}", server.addr().port())
    }

    fn path_of(published: &Published) -> String {
        format!("/{}", published.token)
    }

    async fn get_with(server: &MediaServer, path: &str, extra: &str) -> Reply {
        test_http::raw(
            server.addr(),
            &format!(
                "GET {path} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n{extra}\r\n",
                host_of(server)
            ),
        )
        .await
    }

    fn assert_no_cors(reply: &Reply) {
        assert!(
            reply
                .headers
                .iter()
                .all(|(name, _)| !name.starts_with("access-control-")),
            "no CORS header may be sent: {:?}",
            reply.headers
        );
    }

    /// Opens a streaming GET and reads past the head plus at least one chunk.
    async fn start_stream(server: &MediaServer, published: &Published) -> (TcpStream, u64, usize) {
        let mut stream = TcpStream::connect(server.addr()).await.expect("connect");
        let request = format!(
            "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
            path_of(published),
            host_of(server)
        );
        stream.write_all(request.as_bytes()).await.expect("write");

        let mut received = Vec::new();
        let mut buffer = vec![0u8; CHUNK];
        let head_end = loop {
            let read = stream.read(&mut buffer).await.expect("read the head");
            assert!(read > 0, "the server closed before the head");
            received.extend_from_slice(&buffer[..read]);
            if let Some(index) = received.windows(4).position(|window| window == b"\r\n\r\n") {
                break index + 4;
            }
        };
        let head = String::from_utf8_lossy(&received[..head_end]).to_ascii_lowercase();
        let length = head
            .lines()
            .find_map(|line| line.strip_prefix("content-length: "))
            .and_then(|value| value.trim().parse().ok())
            .expect("a streamed response announces its length");
        let mut body = received.len() - head_end;
        while body < CHUNK {
            let read = stream.read(&mut buffer).await.expect("read a chunk");
            assert!(read > 0, "the stream ended before one chunk");
            body += read;
        }
        (stream, length, body)
    }

    /// Reads until EOF or a read error; both end the stream.
    async fn drain(stream: &mut TcpStream) -> usize {
        let mut buffer = vec![0u8; CHUNK];
        let mut total = 0;
        let read_all = async {
            loop {
                match stream.read(&mut buffer).await {
                    Ok(0) | Err(_) => break,
                    Ok(read) => total += read,
                }
            }
        };
        tokio::time::timeout(Duration::from_secs(20), read_all)
            .await
            .expect("the stream must end");
        total
    }

    #[test]
    fn parse_range_follows_every_rule_of_d3() {
        use RangeOutcome::{Full, Partial, Unsatisfiable};
        let cases: &[(Option<&str>, u64, RangeOutcome)] = &[
            (None, 100, Full),
            (Some("bytes=10-19"), 100, Partial { start: 10, end: 19 }),
            (Some("bytes=90-"), 100, Partial { start: 90, end: 99 }),
            (Some("bytes=-10"), 100, Partial { start: 90, end: 99 }),
            // `b` is clamped to the last byte.
            (Some("bytes=10-500"), 100, Partial { start: 10, end: 99 }),
            // A suffix longer than the file is the whole file.
            (Some("bytes=-500"), 100, Partial { start: 0, end: 99 }),
            (Some("bytes=0-0"), 100, Partial { start: 0, end: 0 }),
            // Unsatisfiable.
            (Some("bytes=100-"), 100, Unsatisfiable),
            (Some("bytes=150-200"), 100, Unsatisfiable),
            (Some("bytes=-0"), 100, Unsatisfiable),
            (Some("bytes=0-"), 0, Unsatisfiable),
            (Some("bytes=-5"), 0, Unsatisfiable),
            // Malformed: served whole.
            (Some("bytes=19-10"), 100, Full),
            (Some("bytes=200-100"), 100, Full),
            (Some("bytes=a-10"), 100, Full),
            (Some("bytes=1-b"), 100, Full),
            (Some("bytes=+1-5"), 100, Full),
            (Some("bytes= 1-5"), 100, Full),
            (Some("bytes=-"), 100, Full),
            (Some("bytes="), 100, Full),
            (Some("bytes=5"), 100, Full),
            (Some("bytes=0-1,5-6"), 100, Full),
            (Some("bytes=99999999999999999999-"), 100, Full),
            (Some("bytes=-99999999999999999999"), 100, Full),
            (Some("items=0-5"), 100, Full),
            (Some("Bytes=0-5"), 100, Full),
            (None, 0, Full),
        ];
        for (header, len, expected) in cases {
            assert_eq!(&parse_range(*header, *len), expected, "{header:?} of {len}");
        }
    }

    #[test]
    fn content_type_follows_the_extension_table() {
        let cases = [
            ("a.mp4", "video/mp4"),
            ("a.M4V", "video/mp4"),
            ("a.mov", "video/quicktime"),
            ("a.mkv", "video/x-matroska"),
            ("a.webm", "video/webm"),
            ("a.avi", "video/x-msvideo"),
            ("a.mp3", "audio/mpeg"),
            ("a.m4a", "audio/mp4"),
            ("a.aac", "audio/aac"),
            ("a.flac", "audio/flac"),
            ("a.ogg", "audio/ogg"),
            ("a.oga", "audio/ogg"),
            ("a.opus", "audio/ogg"),
            ("a.wav", "audio/wav"),
            ("a.xyz", "application/octet-stream"),
            ("no_extension", "application/octet-stream"),
        ];
        for (name, expected) in cases {
            assert_eq!(content_type_of(Path::new(name)), expected, "{name}");
        }
    }

    #[test]
    fn check_file_accepts_only_readable_regular_files() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let file = dir.path().join("a.mp4");
        fs::write(&file, b"x").expect("write");

        assert!(check_file(&file).is_ok());
        assert_eq!(
            check_file(dir.path()).expect_err("a directory").kind(),
            io::ErrorKind::InvalidInput
        );
        assert_eq!(
            check_file(&dir.path().join("missing.mp4"))
                .expect_err("a missing file")
                .kind(),
            io::ErrorKind::NotFound
        );
    }

    #[test]
    fn starting_outside_a_runtime_fails_instead_of_panicking() {
        assert!(MediaServer::start().is_err());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn server_listens_on_loopback_only() {
        let server = MediaServer::start().expect("start");
        assert_eq!(server.addr().ip(), Ipv4Addr::LOCALHOST);
        assert_ne!(server.addr().port(), 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn published_tokens_are_distinct_128_bit_hex() {
        let server = MediaServer::start().expect("start");
        let first = server.publish(PathBuf::from("a.mp4")).expect("publish");
        let second = server.publish(PathBuf::from("a.mp4")).expect("publish");

        assert_ne!(first.token, second.token);
        for published in [&first, &second] {
            assert_eq!(published.token.len(), 32);
            assert!(published
                .token
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)));
            assert_eq!(
                published.url,
                format!(
                    "http://127.0.0.1:{}/{}",
                    server.addr().port(),
                    published.token
                )
            );
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn single_byte_range_is_served() {
        let content = hundred_bytes();
        let (server, published, _dir) = serve(&content, "a.mp4");

        for (range, start, end) in [
            ("bytes=10-19", 10, 19),
            ("bytes=90-", 90, 99),
            ("bytes=-10", 90, 99),
        ] {
            let reply = get_with(
                &server,
                &path_of(&published),
                &format!("Range: {range}\r\n"),
            )
            .await;
            assert_eq!(reply.status, 206, "{range}");
            assert_eq!(reply.body, content[start..=end], "{range}");
            let expected_length = (end - start + 1).to_string();
            assert_eq!(
                reply.header("content-length"),
                Some(expected_length.as_str())
            );
            let expected_range = format!("bytes {start}-{end}/100");
            assert_eq!(reply.header("content-range"), Some(expected_range.as_str()));
            assert_eq!(reply.header("content-type"), Some("video/mp4"));
            assert_eq!(reply.header("accept-ranges"), Some("bytes"));
            assert_eq!(reply.header("cache-control"), Some("no-store"));
            assert_no_cors(&reply);
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn unsatisfiable_range_is_refused() {
        let (server, published, _dir) = serve(&hundred_bytes(), "a.mp4");

        let reply = get_with(&server, &path_of(&published), "Range: bytes=100-\r\n").await;

        assert_eq!(reply.status, 416);
        assert_eq!(reply.header("content-range"), Some("bytes */100"));
        assert_eq!(reply.header("cache-control"), Some("no-store"));
        assert!(reply.body.is_empty());
        assert_no_cors(&reply);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn unusable_range_header_returns_the_whole_file() {
        let content = hundred_bytes();
        let (server, published, _dir) = serve(&content, "a.mp4");

        for extra in ["", "Range: bytes=abc\r\n", "Range: bytes=0-1,5-6\r\n"] {
            let reply = get_with(&server, &path_of(&published), extra).await;
            assert_eq!(reply.status, 200, "{extra:?}");
            assert_eq!(reply.body, content, "{extra:?}");
            assert_eq!(reply.header("content-length"), Some("100"));
            assert_eq!(reply.header("accept-ranges"), Some("bytes"));
            assert_eq!(reply.header("cache-control"), Some("no-store"));
            assert_no_cors(&reply);
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn an_empty_file_is_served_empty() {
        let (server, published, _dir) = serve(b"", "a.wav");

        let reply = get_with(&server, &path_of(&published), "").await;

        assert_eq!(reply.status, 200);
        assert_eq!(reply.header("content-length"), Some("0"));
        assert_eq!(reply.header("content-type"), Some("audio/wav"));
        assert!(reply.body.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn head_carries_no_body() {
        let (server, published, _dir) = serve(&hundred_bytes(), "a.mp4");

        let reply = test_http::raw(
            server.addr(),
            &format!(
                "HEAD {} HTTP/1.1\r\nHost: {}\r\nRange: bytes=0-9\r\nConnection: close\r\n\r\n",
                path_of(&published),
                host_of(&server)
            ),
        )
        .await;

        // `Range` is ignored on HEAD.
        assert_eq!(reply.status, 200);
        assert_eq!(reply.header("content-length"), Some("100"));
        assert_eq!(reply.header("accept-ranges"), Some("bytes"));
        assert!(reply.body.is_empty(), "HEAD must carry no body");
        assert_no_cors(&reply);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn other_methods_are_refused() {
        let (server, published, _dir) = serve(&hundred_bytes(), "a.mp4");

        let reply = test_http::raw(
            server.addr(),
            &format!(
                "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                path_of(&published),
                host_of(&server)
            ),
        )
        .await;

        assert_eq!(reply.status, 405);
        assert_eq!(reply.header("allow"), Some("GET, HEAD"));
        assert_eq!(reply.header("cache-control"), Some("no-store"));
        assert!(reply.body.is_empty());
        assert_no_cors(&reply);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn unknown_token_is_refused() {
        let (server, published, _dir) = serve(&hundred_bytes(), "a.mp4");

        let never = get_with(&server, &format!("/{}", "0".repeat(32)), "").await;
        assert_eq!(never.status, 404);
        assert_eq!(never.header("cache-control"), Some("no-store"));
        assert!(never.body.is_empty());
        assert_no_cors(&never);

        drop(
            server
                .revoke(&published.token)
                .expect("the token was published"),
        );
        let revoked = get_with(&server, &path_of(&published), "").await;
        assert_eq!(revoked.status, 404);
        assert!(
            server.revoke(&published.token).is_none(),
            "revoking twice finds nothing"
        );
    }

    /// Nothing is ever selected by path: only an exact `/<token>` without a
    /// query names a resource.
    #[tokio::test(flavor = "multi_thread")]
    async fn paths_and_queries_never_select_a_file() {
        let (server, published, dir) = serve(&hundred_bytes(), "a.mp4");
        let file_path = dir.path().join("a.mp4");

        for path in [
            "/".to_string(),
            format!("{}/x", path_of(&published)),
            format!("{}?x=1", path_of(&published)),
            file_path.display().to_string(),
            "/../etc/passwd".to_string(),
            format!("/{}", published.token.to_uppercase()),
        ] {
            let reply = get_with(&server, &path, "").await;
            assert_eq!(reply.status, 404, "{path}");
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn foreign_host_is_refused() {
        let (server, published, _dir) = serve(&hundred_bytes(), "a.mp4");
        let port = server.addr().port();

        for host in [
            format!("Host: localhost:{port}\r\n"),
            "Host: 127.0.0.1\r\n".to_string(),
            format!("Host: evil.example:{port}\r\n"),
            String::new(),
        ] {
            let reply = test_http::raw(
                server.addr(),
                &format!(
                    "GET {} HTTP/1.1\r\n{host}Connection: close\r\n\r\n",
                    path_of(&published)
                ),
            )
            .await;
            // A missing `Host` is refused the same way.
            assert_eq!(reply.status, 403, "{host:?}");
            assert!(reply.body.is_empty());
            assert_no_cors(&reply);
        }
    }

    /// The file is re-checked per request, so one that vanished or turned into
    /// a directory after publishing is simply not there.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_file_gone_since_publishing_is_not_found() {
        let (server, published, dir) = serve(&hundred_bytes(), "a.mp4");
        fs::remove_file(dir.path().join("a.mp4")).expect("remove");
        assert_eq!(
            get_with(&server, &path_of(&published), "").await.status,
            404
        );

        fs::create_dir(dir.path().join("a.mp4")).expect("mkdir");
        assert_eq!(
            get_with(&server, &path_of(&published), "").await.status,
            404
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn revocation_stops_a_running_stream() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let server = MediaServer::start().expect("start");
        let published = server
            .publish(sparse(dir.path(), "a.mkv"))
            .expect("publish");

        let (mut stream, length, before) = start_stream(&server, &published).await;
        assert_eq!(length, LARGE);
        drop(server.revoke(&published.token).expect("published"));
        let after = drain(&mut stream).await;

        assert!(
            ((before + after) as u64) < length,
            "the stream must end before the announced length: {} of {length}",
            before + after
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn dropping_the_server_ends_a_running_stream() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let server = MediaServer::start().expect("start");
        let published = server
            .publish(sparse(dir.path(), "a.mkv"))
            .expect("publish");

        let (mut stream, length, before) = start_stream(&server, &published).await;
        drop(server);
        let after = drain(&mut stream).await;

        assert!(((before + after) as u64) < length);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_file_that_shrinks_mid_stream_ends_short() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = sparse(dir.path(), "a.mkv");
        let server = MediaServer::start().expect("start");
        let published = server.publish(path.clone()).expect("publish");

        let (mut stream, length, before) = start_stream(&server, &published).await;
        fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .and_then(|file| file.set_len(0))
            .expect("truncate");
        let after = drain(&mut stream).await;

        assert!(((before + after) as u64) < length);
    }

    /// A partial response streams from the requested offset, not from zero.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_large_range_is_streamed_from_its_offset() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("a.mp4");
        let content: Vec<u8> = (0..(CHUNK * 3)).map(|index| (index % 251) as u8).collect();
        fs::write(&path, &content).expect("write");
        let server = MediaServer::start().expect("start");
        let published = server.publish(path).expect("publish");

        let start = CHUNK + 7;
        let reply = get_with(
            &server,
            &path_of(&published),
            &format!("Range: bytes={start}-\r\n"),
        )
        .await;

        assert_eq!(reply.status, 206);
        assert_eq!(reply.body, content[start..]);
    }
}

/// A minimal raw HTTP/1.1 client for the tests of this and the session layer.
#[cfg(test)]
pub(crate) mod test_http {
    use std::net::SocketAddr;
    use std::time::Duration;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    pub struct Reply {
        pub status: u16,
        /// Lowercased names.
        pub headers: Vec<(String, String)>,
        pub body: Vec<u8>,
    }

    impl Reply {
        pub fn header(&self, name: &str) -> Option<&str> {
            self.headers
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.as_str())
        }
    }

    /// Sends `request` verbatim and reads until the server closes.
    pub async fn raw(addr: SocketAddr, request: &str) -> Reply {
        let exchange = async {
            let mut stream = TcpStream::connect(addr).await.expect("connect");
            stream.write_all(request.as_bytes()).await.expect("write");
            let mut received = Vec::new();
            let _ = stream.read_to_end(&mut received).await;
            received
        };
        let received = tokio::time::timeout(Duration::from_secs(10), exchange)
            .await
            .expect("the exchange must finish");
        parse(&received)
    }

    /// GETs a published URL, or `None` when nothing accepts the connection.
    pub async fn get(url: &str) -> Option<Reply> {
        let rest = url.strip_prefix("http://").expect("an http URL");
        let (host, path) = rest.split_at(rest.find('/').expect("a path"));
        let addr: SocketAddr = host.parse().expect("a socket address");
        let exchange = async {
            let mut stream = TcpStream::connect(addr).await.ok()?;
            let request =
                format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n");
            stream.write_all(request.as_bytes()).await.ok()?;
            let mut received = Vec::new();
            let _ = stream.read_to_end(&mut received).await;
            Some(received)
        };
        let received = tokio::time::timeout(Duration::from_secs(10), exchange)
            .await
            .expect("the exchange must finish")?;
        Some(parse(&received))
    }

    fn parse(received: &[u8]) -> Reply {
        let Some(head_end) = received.windows(4).position(|window| window == b"\r\n\r\n") else {
            // Closed or reset without a response.
            return Reply {
                status: 0,
                headers: Vec::new(),
                body: Vec::new(),
            };
        };
        let head = String::from_utf8_lossy(&received[..head_end]);
        let mut lines = head.split("\r\n");
        let status = lines
            .next()
            .and_then(|line| line.split(' ').nth(1))
            .and_then(|code| code.parse().ok())
            .expect("a status line");
        let headers = lines
            .filter_map(|line| line.split_once(':'))
            .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
            .collect();
        Reply {
            status,
            headers,
            body: received[head_end + 4..].to_vec(),
        }
    }
}
