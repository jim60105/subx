# AGENTS.md

## Project & Architecture

`subx` is a desktop GUI for `subx-cli` (AI-powered subtitle matching, conversion, sync, and translation), built with Tauri 2, React 18 + TypeScript (Vite 7), and Rust. GPL-3.0-or-later.

The Rust backend is a thin translation layer over `subx-cli`. Subtitle logic and shared configuration (`~/.config/subx/config.toml`) are owned by `subx-cli`.

## Build & Validation

Requires Node 20 and a stable Rust toolchain. Building on Linux requires `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, and `libgtk-3-dev`.

```bash
npm install                # always first
npm run tauri dev          # run dev app
npm run verify             # complete verification suite — mandatory before pushing
```

`npm run verify` executes: `tsc --noEmit` → `npm run test:coverage` → `npm run test:rust:coverage` → `npm run spec:trace` → `npm run bindings:check`.

Narrower verification commands:
```bash
npx vitest run <path-to-test>                         # run specific frontend test file
cargo test --manifest-path src-tauri/Cargo.toml       # backend tests (fast, no coverage)
npm run spec:trace -- --report                        # list scenario IDs and status
npm run bindings:generate                             # regenerate src/types/bindings.ts
```

Note: CI runs on `push` only; `npm run verify` is the primary verification gate.

## Critical Invariants & Gotchas

### Backend (`src-tauri/src/`)
- **Thin Commands**: Tauri commands in `commands/*.rs` contain no business logic; they delegate to plain functions taking `&dyn ConfigService`.
- **Config Cache**: `ProductionConfigService` caches configuration in memory. Command functions must call `service.reload()` prior to reading.
- **Backend I18n**: The backend emits stable error/category codes (`core.<category>`), never localized prose strings. Hint presence is conveyed via `core.<category>.hint`.
- **IPC Key Security**: Raw API keys must never cross IPC. Only `apiKeyMasked` and `apiKeySet` cross the boundary.
- **Cli Isolation**: `subx-cli` dependencies must stay inside `src-tauri/` (enforced by `src/i18n/backendCodeParity.test.ts`).
- **Command Allowlist**: Every new command must be registered in the `COMMANDS` allowlist in `ipc_tests.rs`.

### Frontend (`src/`)
- **Single Page Shell**: Screens switch in React state via `ScreenId` (`navigation/screens.ts`). Do not add a router.
- **Typed IPC**: Access backend commands strictly through `commands` in `src/types/ipc.ts`. Direct `invoke("name")` calls are rejected by lint.
- **Design Tokens**: Every visual style value must use `var(--token)` from `styles/tokens.css`. Color literals trigger test failures (`tokens.colorLiteral.test.ts`).
- **Theme Storage**: GUI theme (`light | dark | system`) is stored in `localStorage` under `subx.theme` and must never be written to `config.toml`.
- **Localization**: User-facing text must use `useTranslation()`. Keys must exist in both `en` and `zh-TW` (enforced by `localeParity.test.ts` and `hardCodedStrings.test.tsx`).

### Verification & OpenSpec Traceability
- **85% Coverage Floor**: Required for both frontend (`vite.config.ts`) and backend (`cargo cov` in `src-tauri/`). Close gaps with tests, not exclusion additions.
- **Spec Traceability**: Each `#### Scenario:` in `openspec/specs/**/spec.md` requires a matching `// @covers <capability>/<requirement-slug>#<scenario-slug>` comment directly above its test. Obtain exact IDs using `npm run spec:trace -- --report`.
- **IPC Bindings**: `src/types/bindings.ts` is auto-generated from Rust `specta::Type` definitions. Never hand-edit; run `npm run bindings:generate`.

## Conventions & Workflow

- **Model Judgment & Style**: Write code matching surrounding idiom, comment density, and naming. Rely on context and model judgment rather than rigid micro-formatting rules.
- **Language Policy**: Write all code comments, docstrings, documentation, and commit messages in English using Conventional Commits. Comments should explain *why*, referencing relevant requirements or specs.
- **OpenSpec Archive Workflow**: Active spec changes live in `openspec/changes/<change-id>/`. Sync delta specs into `openspec/specs/` during implementation, then archive using `openspec archive --skip-specs`.
