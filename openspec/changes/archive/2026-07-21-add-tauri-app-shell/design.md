# Design: add-tauri-app-shell

## Context

`subx` is a brand-new repository that will host the desktop GUI for the existing `subx-cli` tool. Brainstorming with the project owner settled the overall product direction: a wizard-driven GUI whose business logic is executed by the `subx-cli` crate consumed as a Cargo library dependency. This change lays the technical foundation; it delivers no subtitle-processing behavior itself.

Constraints:

- The `subx-cli` project must not be modified.
- The project is unreleased with zero users; no backward compatibility or migration concerns apply.
- The GUI must serve both novices (simple defaults) and power users (expandable advanced options) — a constraint that mostly shapes later changes but influences the shell layout (task-entry hub, wizard pattern).

## Goals / Non-Goals

**Goals:**

- A running Tauri 2 desktop app with React 18 + TypeScript + Vite frontend, buildable on Linux, macOS, and Windows.
- A backend crate structure that keeps the Tauri command layer thin (DTO conversion, crate calls, event emission only) so a future `subx-core` extraction is a dependency swap, not a rewrite.
- Home screen as a task-entry hub with a functional placeholder for Match and "coming soon" cards for Convert / Sync / Translate.
- Reusable `WizardShell` component: step indicator, back/next navigation, content slot.
- Neon-gradient dual theme (dark default identity, light variant) driven by CSS custom properties.
- i18n with English (default) and Traditional Chinese, system-locale detection, runtime switching.

**Non-Goals:**

- No match, convert, sync, or translate functionality (later changes).
- No settings page (later change `add-settings-page`); the shell only reserves its navigation slot.
- No reading or writing of `~/.config/subx/config.toml` yet.
- No auto-update, packaging pipeline, or code signing (post-v1 concerns).

## Decisions

### D1: Tauri 2 + React 18 + TypeScript + Vite

Chosen per brainstorming. Tauri gives a small Rust-native binary that can link `subx-cli` directly — the whole point of the architecture. React + TypeScript was the owner's stack preference (ecosystem, component libraries). Vite is Tauri's default and fastest dev loop. Alternative Svelte was considered and declined by the owner.

### D2: Thin command layer with fixed module boundaries

`src-tauri/src/` is organized as `commands/` (one module per feature area), `dto.rs` (serde DTOs mirrored in `src/types/`), `state.rs` (Tauri managed state), `error.rs` (crate error → `ErrorDto { code, message, hint_code }` mapping). Commands contain zero business logic: they translate DTOs, call `subx-cli` crate APIs, and emit progress events. Rationale: the owner plans to eventually extract `subx-core` from `subx-cli`; if all crate access lives behind this thin layer, that migration touches only `use` paths and `Cargo.toml`. Alternative — richer backend services in the GUI — was rejected because it would duplicate crate logic and widen the future migration surface.

### D3: Backend-owned state, ID-based frontend references

Even in this foundation change, the pattern is fixed: canonical Rust data stays in Tauri managed state; the frontend receives display DTOs and sends back only identifiers. This prevents lossy JS round-trips of rich Rust types (e.g., `MatchOperation` in the later match change) and is established here so all feature changes follow it.

### D4: CSS custom properties for theming, no CSS-in-JS

Two token sets (dark: `#0d1021` base with violet `#7c3aed` → cyan `#06b6d4` gradient accents and glassmorphism panels; light: same gradient accents on light neutrals) exposed as CSS custom properties on `:root[data-theme="dark|light"]`. Default follows `prefers-color-scheme`; a manual override is persisted in `localStorage`. Rationale: zero runtime cost, trivially serializable tokens, works identically in every component library. CSS-in-JS rejected for bundle weight and needless complexity in a small app.

### D5: i18next + react-i18next with frontend-only translation

Locale JSON files at `src/locales/{en,zh-TW}/*.json`, split per feature namespace. First launch detects the system locale (`navigator.language`, `zh-TW`-family → Traditional Chinese, otherwise English); the choice is persisted in `localStorage` and switchable at runtime. The Rust backend never translates — it returns stable error/hint codes that the frontend maps to localized strings. Rationale: keeps the command layer thin (D2) and all display concerns in one place. Alternatives (Lingui, backend translation via fluent-rs) rejected as heavier or violating the thin-layer principle.

### D6: GUI preferences in `localStorage`, not in the shared CLI config

Language, theme override, and window-state preferences live in `localStorage`. The shared `~/.config/subx/config.toml` (used from the settings change onward) stores only what the CLI also understands. Rationale: writing GUI-only keys into the CLI config would pollute a file the CLI validates strictly.

### D7: `subx-cli` from crates.io, pinned minor version

`subx-cli = "1.7"` as a normal crates.io dependency. A git/path dependency was considered for faster iteration but rejected for v1: the needed APIs (`ComponentFactory`, `MatchEngine`, `ConfigService`) are already published, and a registry dependency keeps builds reproducible for contributors.

### D8: One shared implementation behind every preference control

Both the header and the settings screen (`add-settings-page`) need to expose the same two GUI-only preferences — language and theme. Rather than each screen wiring its own `<select>`, a single presentational component, `PreferenceSelect` (`src/components/PreferenceSelect/`), owns the markup, accessibility wiring, and the `compact`/`labeled` presentation switch. Domain-specific wrappers `LanguageSelect` and `ThemeSelect` (`src/components/LanguageSelect/`, `src/components/ThemeSelect/`) supply only their own options and change handler and render through `PreferenceSelect`. `AppHeader` uses the `compact` variant (visually hidden label); `add-settings-page` MUST reuse the same two wrapper components with the `labeled` variant rather than re-implementing the pickers. Rationale: both surfaces control the exact same state (`localStorage` + i18next / the theme controller); duplicating the wiring would let the header and settings screen drift out of sync on behavior (e.g. persistence, available options) even though the markup differs.

## Risks / Trade-offs

- [Tauri 2 + linked crate compile times grow] → keep dev profile default opt-level; the frontend dev loop (Vite HMR) is unaffected; acceptable for a small team.
- [`subx-cli` engine code prints to stdout in library use] → harmless in a GUI process (no attached console in release builds); revisit if logs need capturing, e.g. by initializing `env_logger` with a file target.
- [WizardShell designed before its first real consumer (match wizard)] → keep it deliberately minimal (step indicator, navigation, slot); extend it in `add-match-wizard` rather than speculating now.
- [GPL-3.0 obligations] → `subx-cli` is GPLv3, so `subx` ships as GPL-3.0-or-later too; the repository already carries the license file and the owner holds copyright on both projects.
- [WebKitGTK/NVIDIA Wayland compositing bug crashes the webview with "Error 71 dispatching to Wayland display" on launch] → set `__NV_DISABLE_EXPLICIT_SYNC=1` in `main()` on Linux before webview creation (least invasive of Tauri's documented workarounds); escalate to `WEBKIT_DISABLE_DMABUF_RENDERER` or `WEBKIT_DISABLE_COMPOSITING_MODE` if the issue persists on other driver versions.

## Migration Plan

Not applicable — greenfield scaffold, no deploy or rollback concerns. Later changes (`add-settings-page`, `add-match-wizard`) build directly on this structure.

## Open Questions

(none — all foundation decisions were settled during brainstorming)
