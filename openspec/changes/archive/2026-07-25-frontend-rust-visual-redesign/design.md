## Context

`subx` is a desktop GUI for `subx-cli` built with Tauri 2, React 18, TypeScript, Vite, and Rust. The application uses a central CSS tokens system (`src/styles/tokens.css`) to enforce dual light and dark themes. The current visual identity relies on violet `#7c3aed` → cyan `#06b6d4` neon gradient accents and basic card styling.

To reflect `subx`'s high-performance Rust backend core, the frontend visual design is being redesigned around the official **Rust Programming Language brand palette** (`#e05d26` -> `#b7410e`), mdBook dark charcoal background (`#141518`), glassmorphic surface elevation, ambient glow shadows, and clean SVG vector line icons.

## Goals / Non-Goals

**Goals:**
- Update primary visual identity tokens in `src/styles/tokens.css` to official Rust programming language brand accents (`#e05d26` -> `#b7410e`).
- Adopt mdBook dark charcoal base (`#141518`) for dark mode and warm parchment (`#f9f8f6`) for light mode.
- Enhance `TaskCard`, `AppHeader`, and `WizardShell` components with glassmorphic backdrop blurs, subtle gradient borders, and hover elevation glows.
- Retain clean SVG vector line icons in `TaskIcons.tsx` without introducing emojis.
- Guarantee 100% compliance with automated contrast tests (`tokens.contrast.test.ts`) and color literal check (`tokens.colorLiteral.test.ts`).

**Non-Goals:**
- Modifying Rust backend code or IPC command handlers.
- Adding third-party UI framework dependencies (e.g. TailwindCSS or component libraries).
- Changing component state management or navigation routing.

## Decisions

### Decision 1: Use Official Rust Programming Language Accent Tokens
- **Choice**: `--accent-from: #e05d26` (Rust Orange) and `--accent-to: #b7410e` (Terracotta/Burnt Orange).
- **Rationale**: Aligns the desktop GUI's visual theme directly with the Rust language ecosystem identity (mdBook, cargo docs, rust-lang.org).
- **Alternatives Considered**: Keeping violet/cyan neon gradient (rejected per user preference for Rust brand identity).

### Decision 2: Glassmorphism Panels with Strict Token Exposure
- **Choice**: All background glows, border highlights, surface blurs, and hover elevations will be declared as CSS custom properties in `tokens.css`.
- **Rationale**: Ensures both light and dark themes update dynamically via `:root[data-theme]`.
- **Alternatives Considered**: Hardcoding color literals in individual component CSS files (rejected by `tokens.colorLiteral.test.ts` linter).

### Decision 3: Preserve Native SVG Line Icons
- **Choice**: Maintain SVG vector line icons in `TaskIcons.tsx` styled with `currentColor`.
- **Rationale**: Matches standard developer tool aesthetic (similar to VSCode or Rust ecosystem tooling) and avoids emoji rendering inconsistencies across operating systems.

## Risks / Trade-offs

- **[Risk]** Color contrast degradation when swapping gradient endpoints → **Mitigation**: Run `npx vitest run src/styles/tokens.contrast.test.ts` continuously to verify WCAG AA contrast compliance across all text/background pairs in both light and dark modes.
