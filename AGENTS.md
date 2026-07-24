# AGENTS.md

## Project

`subx` is a desktop GUI for the `subx-cli` crate (AI-powered subtitle matching: match, convert, sync, translate). Tauri 2 shell, React 18 + TypeScript frontend (Vite 7), Rust backend. Small codebase, GPL-3.0-or-later.

The Rust backend owns **no** subtitle logic — it is a thin translation layer over `subx-cli`, which also owns the shared config at `~/.config/subx/config.toml` that the CLI and this GUI both read and write.

## Build and validation

Node 20 and a stable Rust toolchain. **Always run `npm install` first.** Building the Tauri app on Linux also needs `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libgtk-3-dev`.

```bash
npm install                # always first
npm run tauri dev          # run the app
npm run verify             # all four gates — always run before pushing
```

`npm run verify` = `tsc --noEmit` → `npm run test:coverage` → `npm run test:rust:coverage` → `npm run spec:trace`. Narrower runs:

```bash
npx vitest run src/theme/themeController.test.tsx   # one frontend file
npx vitest run -t "restores a persisted override"   # one test by name
cargo test --manifest-path src-tauri/Cargo.toml     # backend tests, no coverage
npm run spec:trace -- --report                      # scenario IDs and their status
```

The backend coverage gate is `cargo cov` and **must run from `src-tauri/`** — it is a cargo alias in `src-tauri/.cargo/config.toml` that cargo only picks up there (`npm run test:rust:coverage` does the `cd`). It needs `cargo-llvm-cov` plus the `llvm-tools-preview` component, and is by far the slowest gate: the first run cold-compiles the whole dependency tree including `subx-cli`, so expect minutes.

**There is no pull-request flow.** CI (`.github/workflows/ci.yml`) runs on `push` only, reporting *after* a bad commit is already on the branch. `npm run verify` is the real defence and runs exactly what CI runs.

### The two gates that fail most often

**Coverage floor: 85 %, both languages.** Frontend thresholds are in `vite.config.ts` (`test.coverage.thresholds`), with `all: true` so a new untested module *lowers* the number instead of vanishing. Stable `llvm-cov` reports no branch data, so the backend gates lines/functions/regions only. **Always close a gap with tests — never by widening a coverage exclusion list.**

**Spec traceability.** Every `#### Scenario:` in `openspec/specs/**/spec.md` needs a test carrying a `// @covers <capability>/<requirement-slug>#<scenario-slug>` line comment directly above it — same syntax in `.ts`, `.tsx`, `.rs`. **Never hand-build these IDs; copy them from `npm run spec:trace -- --report`.** The checker also fails on an annotation matching no scenario, which is what renaming a spec heading produces. A scenario automation cannot reach is waived in `scripts/spec-coverage.config.json` with both a `reason` and a `manualVerification` field; exactly one waiver exists (NVIDIA/Wayland launch).

## Architecture

### Backend — `src-tauri/src/`

Layering is spec-locked: **Tauri commands contain no business logic.**

- `commands/*.rs` — one module per feature area; translate DTOs, call `subx-cli`, emit events. Each `#[tauri::command]` is a two-line wrapper delegating to a plain function taking `&dyn ConfigService` rather than `State`; that split is what makes the logic testable.
- `dto.rs` — serde types crossing IPC, all `#[serde(rename_all = "camelCase")]`.
- `error.rs` — `ErrorDto { code, message, hint_code? }`; **every command returns `Result<T, ErrorDto>`.**
- `state.rs` — `AppState`, holding exactly one `Arc<dyn ConfigService>`.
- `handlers.rs` — the crate's **single** `generate_handler!`, kept out of `lib.rs` so tests register the real list; two lists that merely happen to agree is the bug this prevents.
- `platform.rs` — Linux NVIDIA/Wayland startup env overrides, a pure decision function plus a thin applier because `main()` is untestable.
- `lib.rs`, `main.rs` — bootstrap only, excluded from coverage.

Invariants to preserve:

- **One `ProductionConfigService` per process.** It caches config in memory and never re-reads the file itself, so reads call `service.reload()` first; a second instance would serve stale data.
- **The backend never emits translated text.** It emits stable codes (`core.<category>`, `config.invalid_provider`) the frontend localizes. The crate's `hint()` returns English prose that must not cross IPC — only its *presence* is signalled, as a `core.<category>.hint` code.
- **The API key never crosses IPC in cleartext** — only `apiKeyMasked` and `apiKeySet`. Add no command returning the raw value.
- **`subx-cli` imports stay inside `src-tauri/`**, enforced repo-wide by `src/i18n/backendCodeParity.test.ts`.

Backend tests call the extracted functions with `TestConfigService`. `ipc_tests.rs` drives the command *wrappers* over `tauri::test`'s mock runtime — the only way to prove a command is really registered and that its payloads serialize into what the TypeScript declares. Its `mock_context` starts with an empty ACL, so **always add a new command to the `COMMANDS` allowlist there.**

### Frontend — `src/`

- `App.tsx` — hub-and-spoke shell; screens switch in React state via `ScreenId` (`navigation/screens.ts`) and the WebView never reloads. **There is no router — do not add one.**
- `features/<name>/` — one screen per feature plus its own `*Api.ts` wrapping `invoke`, and its form hooks.
- `components/<Name>/` — shared UI, one folder per component with a co-located `.css`.
- `types/ipc.ts` — hand-written TypeScript mirrors of the Rust DTOs, matching the camelCase serde renaming one-to-one.
- `theme/` — `light | dark | system`, resolved against `prefers-color-scheme`, applied as `data-theme` on `<html>`. GUI-local (`localStorage`, key `subx.theme`) and **never written to the shared CLI config file.**
- `styles/tokens.css` — every colour, radius, shadow and spacing value in the app.
- `i18n/` — `en` and `zh-TW`, split by namespace (`common`, `errors`, `home`, `settings`, `wizard`).

## Coding style

No Prettier, ESLint or `rustfmt.toml` config exists; match the surrounding code exactly.

**TypeScript / React.** Double quotes, semicolons, 2-space indent, ~100-column lines. Components are **named** function exports (`export function TaskCard(…)`); only `App` is a default export. Props go in an `interface <Component>Props` declared directly above the component and destructured in the signature; export it only when callers need the type. Use `import type` for type-only imports. Alongside `strict`, `noUnusedLocals`, `noUnusedParameters` and `noFallthroughCasesInSwitch` make unused bindings build failures, not warnings.

**CSS.** BEM: `.block`, `.block__element`, `.block--modifier`. **Every visual value is a `var(--token)` from `tokens.css`.** Never hard-code a colour: `tokens.colorLiteral.test.ts` scans stylesheets *and* inline `style={{}}` props and will fail the build, and the contrast proof in `tokens.contrast.test.ts` only means anything if nothing bypasses the tokens.

**Rust.** `cargo fmt` defaults, `//!` module docs on every module, `///` on public items.

**Tests.** Vitest runs with `globals: false`, so **always import `describe`, `expect`, `it` explicitly from `"vitest"`.** Render through `src/test/renderWithI18n.tsx` and mock the backend with `mockIPC` from `@tauri-apps/api/mocks`; `src/test/setup.ts` clears `localStorage`, resets `data-theme` and installs a `matchMedia` stub before each test. Query rendered UI by accessible role and name — `getByRole` is used throughout, and `data-testid` appears only on a purpose-built probe component that surfaces hook state in `themeController.test.tsx`.

**Localization.** No user-facing string may be hard-coded in a component; reach it via `useTranslation("<namespace>")`. Locale keys are nested camelCase, except entries under `codes.` and `hints.` which are keyed by the literal backend code string. A new key must be added to **both** `en` and `zh-TW`. Three cross-cutting tests enforce this, and **a new screen must be registered in the first**: `i18n/hardCodedStrings.test.tsx` (renders every screen under i18next `cimode`, so surviving prose came from a component), `i18n/localeParity.test.ts`, and `i18n/backendCodeParity.test.ts`.

## Workflow and conventions

Spec-driven via OpenSpec: `openspec/specs/<capability>/spec.md` is current truth; a change in flight lives in `openspec/changes/<change-id>/` (`proposal.md`, `design.md`, `tasks.md`, `specs/`) and is archived under `changes/archive/` when done. Per `openspec/config.yaml`, every change's tasks must annotate or justifiably waive each new scenario.

Before adding a DTO, check whether the in-flight `add-typed-ipc-bindings` change has landed — it replaces the hand-written `src/types/ipc.ts` mirrors with `specta`/`tauri-specta`-generated bindings guarded by a drift check.

**Write all code comments, doc comments, documentation and commit messages in English.** Use Conventional Commits. Comments here explain *why*, routinely citing the spec requirement satisfied or the specific bug a decision prevents. Match that register; never add comments that restate what the code already says.
