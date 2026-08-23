## Why

SubX ships the stock Tauri logo. `src-tauri/icons/` still holds the framework's
default yellow-and-cyan interlocking rings, and `v0.1.0` bundled that mark into
every `.dmg`, `.msi`, `.deb` and `.AppImage` on the releases page. The result is
an application that is unidentifiable in a dock or taskbar, indistinguishable
from every other unbranded Tauri app, and that presents another project's mark
as its own — while the product itself already has a deliberate visual identity
(the Rust orange `#e05d26` → `#b7410e` gradient declared in `tokens.css`) that
the icon does not share.

The icon is also the one asset with no source of truth in this repository: the
PNG/ICO/ICNS set was copied in whole, so there is nothing to edit, nothing to
review in a diff, and no way to tell a regenerated icon from a stale one.

## What Changes

- Add a hand-authored, square SVG brand mark at `assets/brand/subx-icon.svg` as
  the **single source of truth** for the application icon. It is reviewable
  geometry in a text diff, not an opaque binary.
- Add a second source SVG holding the same mark inset to the macOS icon-grid
  body ratio, because `tauri icon` applies no platform inset of its own — a
  full-bleed tile would ship on macOS visibly larger and squarer than the icons
  beside it. It feeds `icon.icns` and nothing else.
- Add a single-colour SVG of the mark for later reuse in the README and the app
  header. Nothing in this change consumes it; it exists so that work starts from
  a file that is in register with the master.
- Regenerate the whole `src-tauri/icons/` set from those SVGs with
  `npm run icons:generate` (a thin wrapper over `tauri icon`), replacing every
  stock Tauri asset — desktop PNGs, `icon.ico`, `icon.icns`, and the Windows
  Store `Square*Logo.png` set.
- **Ship desktop output only.** The generator also emits Android and iOS trees
  that this project has no target for; they are discarded after each run, and
  the empty `android/` and `ios/` directory shells left in the working tree by
  an earlier run are removed.
- Record the SVG's digest alongside the generated set so a **staleness gate**
  can fail when the source is edited without regenerating, in the same spirit as
  the existing `bindings:check` gate.
- Add `scripts/app-icon.test.ts`, carrying `@covers` annotations, asserting the
  source SVG's invariants (square viewBox, self-contained, brand palette, no
  embedded raster or text) and that the generated set is complete, correctly
  sized, and no longer the stock Tauri artwork.
- Document the mark — concept, construction grid, colour list, simplification
  ladder, and the natural-language description used to brief it — in
  `design.md`, and record the regeneration procedure in `docs/`.

Not in this change, deliberately: putting the mark into the in-app header
(`AppHeader` keeps its text-only brand block), the README, or an HTML favicon.
Those consume the asset this change creates and can follow once it exists.

## Capabilities

### New Capabilities

- `app-icon`: The application's brand mark — an SVG source of truth, the
  platform icon set generated from it, the identity and legibility constraints
  the mark must satisfy, and the gate that keeps generated output in step with
  its source.

### Modified Capabilities

<!-- None. No existing requirement changes: app-shell keeps its text-only brand
     block, and release-pipeline already bundles whatever `bundle.icon` names. -->

## Impact

- **New source assets**: `assets/brand/subx-icon.svg` (master),
  `subx-icon-macos.svg`, `subx-mark-mono.svg`.
- **Regenerated binaries**: every file under `src-tauri/icons/` is replaced.
  `src-tauri/tauri.conf.json` keeps every path already in its `bundle.icon`
  list — the files change content, not path — and gains one entry, `64x64.png`,
  which the generator produces anyway and which gives Linux packagers one more
  exact `hicolor` size instead of a downscale.
- **New tooling**: `icons:generate` and `icons:check` scripts in
  `package.json`; `icons:check` joins `npm run verify`, and therefore CI.
- **New tests**: `scripts/app-icon.test.ts` — counts against the 85 % frontend
  coverage floor and against `npm run spec:trace`.
- **Docs**: a regeneration section in `docs/`, referenced from `AGENTS.md`.
- **Release artifacts**: the next tagged release carries the new mark on every
  platform. No installer, identifier, or packaging behaviour changes — only the
  artwork inside the bundles. Existing installs will pick the new icon up on
  upgrade, subject to each OS's icon cache.
- **Toolchain**: `tauri icon` rasterises SVG through `resvg`. The mark must stay
  inside what `resvg` renders faithfully — no external fonts, no external
  references, no exotic filters.
