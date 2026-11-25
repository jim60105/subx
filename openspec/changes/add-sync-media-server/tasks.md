# Tasks

Boundaries: edit only the files named below. No component, hook or locale file other than `errors.json` changes. Tests for this change's scenarios stay without `// @covers`; annotations are added at archive. Never attach a stand-in ID.

## 1. Media server

- [ ] 1.1 Edit `src-tauri/Cargo.toml` per design D2. Verify: `cargo check --manifest-path src-tauri/Cargo.toml` passes and `git diff src-tauri/Cargo.lock` adds no `[[package]]` block and changes no version.
- [ ] 1.2 Create `src-tauri/src/media_server.rs` per D3 and declare it in `lib.rs`. In its `#[cfg(test)]` module, unit-test every `parse_range` rule of D3 as a table, and `content_type_of` for one extension per type plus an unknown one. Verify: `cargo test --manifest-path src-tauri/Cargo.toml media_server`.
- [ ] 1.3 In the same test module send raw HTTP/1.1 over `tokio::net::TcpStream` (with `Connection: close`) to a started server and write one test per scenario of "Preview media is served over token-authorized loopback HTTP". For revocation use a 64 MiB sparse file, read the head and one chunk, revoke, then read until EOF or a read error (both end the stream) and assert fewer body bytes than `Content-Length`. Also assert no response header starts with `access-control-`, that two published tokens differ and have 32 hex digits, and that dropping the server ends a running stream. Verify: same command.

## 2. Session and commands

- [ ] 2.1 Add `PreviewState` to `state.rs` per D4 and the DTOs to `dto.rs` per D5. Verify: `cargo check`.
- [ ] 2.2 Create `commands/preview.rs` per D5 (add to `commands/mod.rs`), make `sync::load_subtitle` `pub(crate)`, register the three commands in `bindings.rs`, extend `COMMANDS` to 25. In `state.rs` test `open_with` with a check blocked on a channel while `close` and `shutdown` complete within one second. Tests in `commands/preview.rs`: one per scenario of "Preview cues come from the apply loader" and "At most one preview session is open". Add to `ipc_tests.rs` one round trip per command asserting camelCase keys. Verify: `cargo test --manifest-path src-tauri/Cargo.toml`.
- [ ] 2.3 Add the exit hook of D6. Verify: `cargo check`; a state test asserts that after `shutdown()` the old URL refuses connection or ends and that a later `open` succeeds.
- [ ] 2.4 `npm run bindings:generate`; re-export `PreviewCueDto` and `PreviewSessionDto` from `src/types/ipc.ts`. Verify: `npx tsc --noEmit`, and with `bindings.ts` staged `npm run bindings:check` passes.

## 3. Policy and codes

- [ ] 3.1 Edit the CSP per D7 and add `scripts/csp-config.test.ts` for "Policy lists loopback media" (split the CSP on `;`, compare the `media-src` source list as a set, assert no other directive contains `127.0.0.1`, assert `app.security.assetProtocol` is undefined). Verify: `npx vitest run scripts/csp-config.test.ts`.
- [ ] 3.2 Add both codes to `src/locales/{en,zh-TW}/errors.json` and `preview` to the parity pattern. Verify: `npx vitest run src/i18n`.
- [ ] 3.3 Run `openspec validate add-sync-media-server --strict` and `npm run verify`. Expected: both exit 0.

## Workflow follow-up

- At archive, after `openspec archive add-sync-media-server --yes`, add `// @covers` lines to the tests of 1.3, 2.2 and 3.1 with the ids from `npm run spec:trace -- --report`.
