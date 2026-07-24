# Design: add-typed-ipc-bindings

## Context

The IPC boundary today is a documented promise with no enforcement. `src/types/ipc.ts` declares itself a mirror of `src-tauri/src/dto.rs`; `settingsApi.ts` names commands as string literals (`invoke<ConfigDto>("get_config")`); `handlers.rs` registers handlers in a `generate_handler!` list that no TypeScript ever sees. Three independent hand-maintained lists, all of which must agree, none of which is checked.

The current surface is small — six DTO types, three commands, no events — and entirely made of owned primitives (`String`, `bool`, `Option<u64>`, one nested struct, one `Option<ErrorDto>`). **No `subx-cli` type crosses the boundary**, which matters: a generation tool needs its own trait implemented on every type it emits, and foreign types are where that gets painful. This surface has none, so the migration is mechanical.

It will not stay small. `add-match-wizard` adds `SourceScanResult`, `MatchPlanDto` (video-grouped operations with nested IDs, target paths, confidence and reasoning, plus unmatched lists), `MatchOperationDto`, `ExecutionReportDto`, and `match-progress` event payloads with a staged enum. That is the point at which hand-transcription stops being merely unverified and starts being genuinely error-prone — and its tasks.md still says "+ TypeScript mirrors".

Nine frontend modules import from `types/ipc` (five production, four test), two of them for the `isErrorDto` runtime guard rather than for types. The guard is the one piece of that file a type generator will never produce.

## Goals / Non-Goals

**Goals:**

- One declaration from which both the handler registration and the TypeScript signatures derive, so they cannot disagree.
- The generated contract committed, diffable, and protected by a gate that fails on drift.
- No path left by which the frontend can address the backend without going through the generated bindings.
- The event mechanism established before the change that needs it, not during it.
- No behaviour change: identical commands, identical payloads. Any difference the generation surfaces is a bug found, not a feature added.

**Non-Goals:**

- **Runtime validation of IPC payloads.** Generated types are compile-time only. Nothing here checks at runtime that the backend sent what it promised; `isErrorDto` remains the sole runtime narrowing, at the one place it is needed.
- **Regenerating the frontend's domain layer.** `settingsApi.ts`'s `AI_FIELDS` ordering, `CONFIG_KEYS` mapping and `AI_PROVIDERS` list encode product decisions the backend does not know about. They stay hand-written and keep their comments.
- **Typed IPC for the plugin surface.** `tauri-plugin-opener` has its own bindings; this change covers the application's own commands.
- **Deleting the mocked-IPC test approach.** `@tauri-apps/api/mocks` stays. Generated types make the mocks type-checked, which is the improvement; replacing them with a real backend is an end-to-end concern and out of scope.

## Decisions

### D1 — specta / tauri-specta, accepting a pre-1.0 dependency

`specta` and `tauri-specta` are at `2.0.0-rc.25`; `specta-typescript` is at `0.0.12`. Taking a release candidate as the backbone of the IPC layer is the significant decision in this change and should not be waved past.

The case for accepting it:

- The project is pre-release with zero users. A breaking upgrade costs a mechanical migration, not a deprecation cycle.
- The blast radius is contained by construction. Specta appears in exactly three places: derives on the DTOs, the builder in `lib.rs`, and the generated file. If the ecosystem stalls, retreating means deleting the derives and committing the last generated output as hand-written types — back to today's position, having lost nothing but the gate.
- The alternative does not do the job. `ts-rs` 12 is stable and would generate the six struct types, but it knows nothing about commands: the string literals in `settingsApi.ts`, the argument shapes, the `Result<T, ErrorDto>` rejection type and the event payloads would all stay hand-maintained. That is most of what is actually at risk, and all of what `add-match-wizard` adds.

The case against — recorded honestly: `specta` 2.0 has been in release candidate for an extended period, `specta-typescript` at `0.0.12` signals an unsettled API, and this change makes them load-bearing for every command path.

*Mitigations.* Pin exact versions (`=2.0.0-rc.25`) rather than caret ranges, so an RC bump is a deliberate act with its own diff. Keep the generated output committed, which means the frontend still type-checks and builds even if generation breaks. And confirm the actual working API against the crate's own documentation at implementation time rather than from this document — the RC's builder API has moved between releases, so task 1.1 is a spike, not a transcription.

*Alternatives considered.* **`ts-rs`** — stable, but structs only (above). **Hand-written golden JSON fixtures** — a Rust test serializes each DTO and the frontend tests consume the fixture files; zero dependencies, catches renames and casing, but does nothing for command names or argument shapes, and becomes throwaway work the moment this change lands. Considered and rejected as an interim step for exactly that reason. **Doing nothing until `specta` 2.0 is stable** — defensible, but it means `add-match-wizard` hand-writes roughly ten more DTO mirrors that would then be deleted.

### D2 — Generate from a test, not from `build.rs`

Generation runs in a Rust test (`cargo test export_bindings`), writing `src/types/bindings.ts`, which is committed. The drift gate regenerates and runs `git diff --exit-code`.

The alternative — emitting from `build.rs` on every compile, with the output gitignored — is the more common Tauri setup and needs no gate at all, since the file cannot be stale. It is rejected for three reasons that matter here. The generated contract is the artifact a reviewer most wants to see change, and gitignoring it hides exactly the diff that says "the IPC boundary moved". A frontend-only `npx tsc --noEmit` or `npm run dev` would require a full Rust build first, since the types would not exist in a fresh checkout. And it conflicts with `add-verification-gates`' premise that gates are explicit and checked in, rather than side effects of a build.

*Determinism is a requirement, not a hope.* A gate built on `git diff` fails uselessly if generation output varies between runs — iteration order over a hash map, a timestamp header, a formatter version. Task 2.4 asserts byte-identical output across two consecutive runs, and the generated file must carry no timestamp or tool-version banner.

### D3 — The builder is the single declaration, constructed in exactly one place

`handlers.rs` currently registers handlers with `tauri::generate_handler![…]` — `add-verification-gates` extracted it from `lib.rs` so the registration would stay inside the measured surface — while `settingsApi.ts` separately names those commands as strings. Both are replaced by one `tauri_specta::Builder` that collects the commands, is used to produce the generated TypeScript, *and* supplies the app's invoke handler. `handlers.rs` remains the single construction site and keeps its existing role; `lib.rs::run()` keeps calling into it. Registration and generation then have one source, which is what makes "a command cannot be registered without a binding" true by construction rather than by discipline.

**The existing allowlist guard has to move with it.** `ipc_tests.rs::the_allowlist_matches_the_registration` pins its `COMMANDS` allowlist by reading `handlers.rs` as text and parsing the `generate_handler![…]` list out of it. Removing the macro removes what that test greps for, so the test does not merely keep passing — it must be re-pointed at the builder's command list, which is the new single source. Task 2.5's "the existing wrapper tests still pass" therefore means *after* that one test is rewritten, not instead of rewriting it; the guard itself is not optional, since `mock_context` starts with an empty ACL and a silently-drifting allowlist is exactly how the suite would end up green against commands the real app never exposes.

**"One source" has to mean one construction site, not two that agree.** The obvious implementation — a `Builder::new().commands(collect_commands![…])` written inline in `run()` and another written inline in the export test — would satisfy every word of this design while quietly recreating the original defect: two hand-maintained command lists, unchecked against each other, one of which a future change can extend while forgetting the other. That is the same failure mode as today's `generate_handler!`-versus-`ipc.ts` split, moved one level down. So the builder is constructed by a single shared function (`bindings::specta_builder()`), which `run()` calls for its invoke handler and the export test calls for its output. Two guards keep it that way: the scenario "There is no second registration path" is verified by a test asserting no `generate_handler!` survives and that exactly one command list exists, mirroring the frontend-side bypass check in D5.

What that guard counts matters more than it first appears. Counting *builder constructions* is the obvious reading and the wrong one twice over: a builder with no commands registers nothing, and any textual match has to pick a spelling — the first version looked for `Builder::<R>::new()`, which is the generic form this module happens to use and *not* the concretely-typed `Builder::<Wry>::new()` a feature module would more naturally write. So the guard counts `.commands(collect_commands!` instead, which is what actually creates a second command list however the builder is typed, and the detector is a pure function proven against both spellings — a guard nobody has watched fail is a guard nobody should trust.

The events collection is wired in the same builder even though the backend emits nothing today. An empty collection generates an empty (or trivially small) event section, which is the point: `add-match-wizard` adds `match-progress` by declaring it, not by first establishing how events are typed while also designing a wizard.

### D4 — What remains hand-written in `src/types/ipc.ts`

The file shrinks to the runtime type guard plus re-exports of the generated types:

```ts
export type { ConfigDto, AiConfigDto, ErrorDto, /* … */ } from "./bindings";
export function isErrorDto(value: unknown): value is ErrorDto { … }
```

Two reasons for keeping the module rather than pointing everything at `bindings.ts` directly. `isErrorDto` is genuine runtime code — it narrows an `unknown` rejection at a `catch` site — and a type generator cannot produce it; it lives next to the types it narrows and is defined against the *generated* `ErrorDto`, so a change to the Rust error shape breaks the guard at compile time. And the eight existing import sites keep working unchanged, keeping this change's diff about the contract rather than about import paths.

### D5 — Closing the bypass

Generated bindings are worth nothing if a feature can still write `invoke("get_config")`. A lint test asserts that no string-literal command invocation appears in `src/**` outside the generated module. Domain wrappers stay legal because they call the generated function rather than naming a command — `settingsApi.ts` keeps its shape, only its three bodies change.

This is the same class of check as `add-verification-gates`' colour-literal and crate-boundary lints, and it exists for the same reason: a rule stated in a comment is a rule that decays.

The Rust side needs the symmetric guard, and it is the one more likely to be tripped: `add-match-wizard` adds four commands, and adding them to a `tauri::generate_handler!` is what every Tauri tutorial says to do. A test asserting no `generate_handler!` invocation survives in `src-tauri/src/` closes it.

### D6 — Interaction with the verification gates

- **This change cannot start until `add-verification-gates` has landed its specs.** Its delta modifies a requirement that does not exist in `openspec/specs/` yet — it arrives only when that change is synced or archived — and it depends on that change's `tauri::test` command-wrapper tests as the cutover's safety net. That is a hard precondition (task 0.1), not the soft "depends on" note in the proposal.
- `src/types/bindings.ts` joins the coverage exclusion list as a generated artifact. `add-verification-gates` requires every exclusion to be individually named with a written reason, which this satisfies; no change to that policy is needed.
- The drift check becomes a fourth gate: a `verification-gates` CI requirement enumerating three gates is modified to enumerate four, and the check joins `npm run verify` and the CI workflow. **It is a step in the existing backend job, not a fourth parallel job**: `cargo test export_bindings` compiles the `tauri` crate, so it needs the same WebKitGTK/GTK system packages the backend coverage job already installs. A separate job would pay that apt-install and build cost twice for one `git diff`.
- **Both of `add-verification-gates`' gate-arming tests enumerate the gates, and both must count the fourth.** `scripts/ci-config.test.ts` asserts the workflow invokes each gate command; `scripts/gate-config.test.ts` asserts `npm run verify` chains them with `&&` and swallows no exit status. Updating only the CI one would leave `verify` — the defence that actually runs before a push — unasserted for the new gate, which is the same "the gate is armed but nothing checks that it is armed" hole those two tests exist to close.
- **Because this project has no pull-request flow**, CI reports after the commit is already on the branch. `npm run verify` is therefore the real defence, and the drift check must be in it — a bindings gate that only ever fires in CI would routinely be discovered one commit too late.
- Every scenario in the new `typed-ipc` spec needs a `@covers` annotation under the traceability gate. Two of them describe generation behaviour rather than product behaviour and are verified by running the generator against fixtures and inspecting its output, which is a real behavioural test — unlike `add-verification-gates`' configuration-assertion compromise, there is no third-party tool here whose enforcement we are declining to re-test.

### D8 — What the spike settled: throw, unified serde, and a wire that moved

Three RC behaviours only became visible by running the generator, and each forced a choice this document had left open.

**`u64` cannot cross.** Specta refuses to emit a 64-bit integer as TypeScript `number`, because JavaScript numbers are f64 and exact only to 2^53. `ConnectionTestResult::latency_ms` was `Option<u64>`, and the hand-written mirror declared `latencyMs?: number` — a claim the receiver cannot honour. Narrowed to `u32`, which covers 49 days of milliseconds. This is the first of the transcription bugs task 3.3 predicted, found exactly as predicted.

**Optionality: the wire moved, not the type.** D7 framed this as a choice between "an attribute producing optional-key output" and "dropping `skip_serializing_if`". The spike closed the first option: specta's unified mode reports `skip_serializing_if requires PhasesFormat because unified mode cannot represent conditional omission`, and its phase-aware mode expresses the attribute only by splitting every affected DTO into a `_Serialize`/`_Deserialize` pair — so the frontend would import `ConnectionTestResult_Serialize`, and the plain `ConnectionTestResult` would be a union of both phases that no single value ever satisfies. Even then the serialize half emits `latencyMs?: number | null`, offering a `null` the wire never sends. Dropping `skip_serializing_if` gives one type per DTO and exact agreement between the declaration and the payload, which is what D7 said the point was. The wire now carries explicit nulls; with zero users that is a free change, and `error.rs`'s serialization test was inverted to pin the new shape rather than deleted.

**Errors throw; they are not returned.** `tauri-specta` defaults to `ErrorHandlingMode::Result`, which types the error in the signature — apparently a strict improvement, and the original wording of the "error type is part of the contract" scenario assumed something like it. It was rejected: the generated `typedError` runtime still rethrows anything `instanceof Error`, so adopting it would give every call site *two* error channels to handle instead of one, and the frontend's error path (`loadError: unknown`, `FieldErrors`, `useLocalizedError(error: unknown)`) is deliberately built to receive any thrown value, not just a backend DTO. `ErrorHandlingMode::Throw` keeps the existing contract, which is also what this change's "no behaviour change" goal asks for.

That leaves the rejection untyped — and it is untypeable: TypeScript types no `catch` binding. So the scenario was reworded to require what is real and checkable, that the error DTO is *part of the generated output* and that the guard is defined against it. `Throw` mode puts nothing in the signatures to pull `ErrorDto` in, so the builder exports it explicitly with `.typ::<ErrorDto>()`; without that line the guard could silently fall back to a hand-written type, which is the whole failure this capability removes.

### D7 — Migration shape

The cutover is one commit, not a coexistence period: hand-written and generated types describing the same payloads would be two sources of truth again, which is the problem being removed. Order within the change: derives and builder first (backend compiles, bindings generate), then `ipc.ts` reduced to the guard, then `settingsApi.ts` and the three test files that construct DTO literals, then the gates.

The verification that this change altered no behaviour is unusually direct: diff the generated `bindings.ts` against the hand-written `ipc.ts` it replaces. Fields should correspond one-to-one, and task 3.3 records the comparison rather than skipping past it. But a discrepancy is not automatically a transcription bug — it must be classified before it is reconciled, because there are two distinct kinds:

**Optional fields are the case to look at first.** Three fields carry `#[serde(skip_serializing_if = "Option::is_none")]` — `ConnectionTestResult::latency_ms`, `ConnectionTestResult::error`, `ErrorDto::hint_code` — and the hand-written TypeScript declares all three as optional properties (`latencyMs?: number`). That attribute controls *key presence* at runtime: when the value is `None` the key is absent from the JSON entirely, so the frontend sees `undefined`. A type generator reflecting on Rust types does not read serde's serialization attributes, and specta's default mapping for `Option<T>` is `T | null` — a property that is always present and may be null. If the generated output says `latencyMs: number | null`, that is not a bug in either the Rust or the old TypeScript; it is the tool describing a *different* wire shape from the one that actually crosses the boundary, and code doing `=== null` would be wrong where `undefined` arrives.

So this needs an answer before the cutover, not after: task 1.2's spike deliberately includes one of these three fields, and if the generated form is `T | null` the plan either applies whatever specta attribute produces optional-key output, or drops `skip_serializing_if` so the wire really does carry `null`. Making the type and the wire agree is the point; which side moves is an implementation call the spike informs.

## Risks / Trade-offs

- **A pre-1.0 dependency becomes load-bearing for every command path.** → Pinned exact versions; three-file blast radius; committed output means a broken generator does not break the build; documented retreat path (delete derives, keep the last generated file as hand-written). Discussed in full in D1.
- **The RC's API may differ from what this document assumes.** → Task 1.1 is explicitly a spike against the crate's current documentation. Nothing downstream depends on the exact builder syntax, only on the capability.
- **Non-deterministic generation would make the drift gate flap.** → Asserted directly by a test (D2), and the generated file must carry no timestamp or version banner.
- **The drift gate fires after the fact**, given no pull-request flow. → It is in `npm run verify`, so the local run catches it before the push; CI is the backstop.
- **`add-match-wizard` is planned against hand-written mirrors.** → Its task 1.2 must be rewritten when this change lands; called out in the proposal's follow-on and worth doing in the same session, not later.
- **The generated file is excluded from coverage**, so a generation bug that emits a broken type is caught by type-checking rather than by tests. → Acceptable: a broken generated type fails `tsc --noEmit`, which is already a CI gate, and is more likely to fail loudly than a coverage percentage would.
- **Nothing prevents a failing gate from reaching the trunk**, only from going unnoticed. With no pull-request flow, CI reports after the commit is already pushed, and `npm run verify` is a convention rather than an enforcement. → Partially mitigated by keeping the drift check in `verify`; a checked-in pre-push hook would close it properly and is raised as an open question below rather than assumed.
- **Archiving after a mid-implementation spec sync (task 6.1) may double-apply the deltas.** The same pattern is used by `add-verification-gates`, so if it is unsafe both changes need the same remedy. → Task 6.1 verifies the sync-then-archive round trip on this change rather than trusting it, and reports the result.

## Migration Plan

No user-facing migration — the project is unreleased with zero users, and the change is behaviour-preserving by construction. Rollback is deleting the specta derives and the builder, restoring `generate_handler!`, and keeping the last generated file as a hand-written module: strictly the position the repository is in today.

## Open Questions

- **Which exact `specta` / `tauri-specta` / `specta-typescript` versions are mutually compatible with `tauri` 2.11.5?** Resolved by the task 1.1 spike, before anything else is written. If no compatible combination exists, this change stops there and `ts-rs` becomes the fallback with a reduced scope (types only, commands still hand-named) — that outcome should be reported rather than worked around.
- Whether `settingsApi.ts`'s wrappers still earn their place once the generated functions are typed, or whether the domain layer collapses into the calling hook. Deliberately left for implementation, when both sides are visible.
- **Should a checked-in pre-push hook run the fast gates?** With no pull-request flow this is the only mechanism that would actually stop a broken contract from reaching the trunk rather than merely reporting it afterwards. The fast subset — `tsc --noEmit`, the frontend suite, traceability, bindings drift — runs in seconds; the backend coverage gate needs a full Rust build and would make a pre-push hook painful enough to be routinely bypassed, so it would stay CI-only. This is a change to how the maintainer works day to day, so it is a decision to take rather than a default to impose — and it belongs to `add-verification-gates`, which owns `npm run verify`, not to this change.
