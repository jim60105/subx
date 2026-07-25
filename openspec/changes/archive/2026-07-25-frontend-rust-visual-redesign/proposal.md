## Why

The current frontend visual design relies on generic violet/cyan accents and flat card containers. Aligning `subx`'s visual identity with the official Rust programming language brand palette (`#e05d26` -> `#b7410e`) and mdBook dark charcoal aesthetic (`#141518`) reinforces the app's high-performance Rust backend engine while delivering a premium, polished glassmorphic desktop GUI experience.

## What Changes

- Update visual identity theme tokens in `tokens.css` from violet/cyan to official Rust programming language brand orange & terracotta accents (`#e05d26` -> `#b7410e`).
- Update dark theme background base to mdBook deep charcoal (`#141518`) with ambient Rust glow effects.
- Enhance glassmorphic card containers (`TaskCard`, `AppHeader`, `WizardShell`) with glowing borders, hover reflections, and subtle elevation shadows.
- Preserve crisp vector SVG line icons (`TaskIcons.tsx`) matching Rust ecosystem design standards without using emojis.
- Ensure 100% compliance with automated WCAG AA contrast testing (`tokens.contrast.test.ts`) and CSS custom property enforcement (`tokens.colorLiteral.test.ts`).

## Capabilities

### New Capabilities

*(None)*

### Modified Capabilities

- `theme-system`: Update theme visual identity requirement from violet/cyan neon gradient to the official Rust programming language brand palette (`#e05d26` -> `#b7410e`) with mdBook dark charcoal base (`#141518`) and glassmorphic surface elevation.

## Impact

- Frontend stylesheets (`src/styles/tokens.css`, `src/styles/global.css`, `src/components/TaskCard/TaskCard.css`, `src/components/AppHeader/AppHeader.css`, `src/components/WizardShell/WizardShell.css`).
- Automated contrast and token unit tests (`src/styles/tokens.contrast.test.ts`, `src/styles/tokens.colorLiteral.test.ts`).
- No impact on Rust backend code, Tauri IPC commands, or CLI config files.
- No backward compatibility or migration issues as the application is in pre-release development.
