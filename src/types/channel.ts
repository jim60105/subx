/**
 * The one permitted re-export of Tauri's `Channel` transport.
 *
 * A generated command that streams progress — `analyze_sources` takes a
 * `Channel<MatchProgress>` — requires the caller to construct a `Channel`. The
 * class lives in `@tauri-apps/api/core`, which the bindings guard
 * (`ipcBoundary.test.ts`) otherwise bans so nothing reaches the backend by
 * command name. Constructing a `Channel` is not a command invocation, so this
 * file is the single controlled place that import is allowed, exactly as
 * `bindings.ts` is the single place a command is named. The guard excepts this
 * file by path; keep it a bare re-export so nothing else can hide here.
 */
export { Channel } from "@tauri-apps/api/core";
