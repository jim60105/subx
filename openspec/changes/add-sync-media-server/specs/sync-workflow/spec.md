# Spec Delta

## ADDED Requirements

### Requirement: Preview cues come from the apply loader

The backend SHALL return the cues of a subtitle file in file order, as whole-millisecond start and end times with their text, read through the same loader that applying an offset uses. A subtitle that loader refuses SHALL yield that loader's error.

#### Scenario: Cues are returned in file order

- **WHEN** preview cues are requested for a subtitle whose second cue starts earlier than its first
- **THEN** the cues are returned in file order with the start, end and text the apply loader reads

#### Scenario: Unparsable subtitle reports the loader error

- **WHEN** preview cues are requested for a file that is not a subtitle
- **THEN** the request fails with the same code applying an offset to that file would report

### Requirement: Preview media is served over token-authorized loopback HTTP

Preview media SHALL be served over HTTP on `127.0.0.1` at an OS-chosen port, one regular file per random 128-bit token, with `GET` and `HEAD`, single byte ranges, streamed bodies, `Cache-Control: no-store` and no CORS headers. A request SHALL never select a file by path.

#### Scenario: Single byte range is served

- **WHEN** a published file of 100 bytes is requested with `Range: bytes=10-19`, `bytes=90-` or `bytes=-10`
- **THEN** the response is 206 with the matching bytes, `Content-Length` and `Content-Range`

#### Scenario: Unsatisfiable range is refused

- **WHEN** a published file of 100 bytes is requested with `Range: bytes=100-`
- **THEN** the response is 416 with `Content-Range: bytes */100`

#### Scenario: Unusable range header returns the whole file

- **WHEN** the `Range` header is missing, malformed or names several ranges
- **THEN** the response is 200 with the whole file and `Accept-Ranges: bytes`

#### Scenario: HEAD carries no body

- **WHEN** a published file is requested with `HEAD`
- **THEN** the response has the file's `Content-Length` and no body

#### Scenario: Other methods are refused

- **WHEN** a published resource is requested with `POST`
- **THEN** the response is 405

#### Scenario: Unknown token is refused

- **WHEN** a request names a token that was never published or was revoked
- **THEN** the response is 404

#### Scenario: Foreign host is refused

- **WHEN** a request for a published resource carries a `Host` other than the server's own `127.0.0.1` address and port
- **THEN** the response is 403

#### Scenario: Revocation stops a running stream

- **WHEN** a token is revoked while its file is being streamed
- **THEN** the stream ends before the announced length is delivered

#### Scenario: Server listens on loopback only

- **WHEN** the server starts
- **THEN** its listening address is `127.0.0.1`

### Requirement: At most one preview session is open

Opening a preview SHALL publish the selected media file and return a session id and its URL, replacing any open session. Closing SHALL revoke the session's URL, be idempotent, and have no effect on any other session. Media that is not a readable regular file SHALL fail with `preview.media_unreadable`; a server that cannot start SHALL fail with `preview.server_unavailable`.

#### Scenario: Opening replaces the previous session

- **WHEN** a preview is opened while another is open
- **THEN** the first session's URL answers 404 and the second session's URL serves its file

#### Scenario: Stale close is ignored

- **WHEN** a replaced session's id is closed
- **THEN** the close succeeds and the newer session's URL still serves its file

#### Scenario: Closing is idempotent

- **WHEN** a session is closed twice
- **THEN** both closes succeed and its URL answers 404

#### Scenario: Unreadable media is reported

- **WHEN** a preview is opened for a directory or a missing file
- **THEN** it fails with `preview.media_unreadable` and an already open session stays open

### Requirement: The content policy admits loopback media only

The application's content security policy SHALL declare `media-src` with exactly `'self'` and `http://127.0.0.1:*`, and the asset protocol SHALL stay disabled.

#### Scenario: Policy lists loopback media

- **WHEN** the application's content security policy is parsed
- **THEN** `media-src` contains exactly `'self'` and `http://127.0.0.1:*`, no other directive names `127.0.0.1`, and no asset protocol is enabled
