# app-icon Specification

## Purpose

The application's brand mark: an SVG source of truth under `assets/brand/`, the platform icon set generated from it, the identity and legibility constraints the mark must satisfy, and the gate that keeps generated output in step with its source.

## Requirements

### Requirement: The application icon is generated from a committed vector source

The repository SHALL hold the application's brand mark as hand-authored SVG under
`assets/brand/`, and every file under `src-tauri/icons/` SHALL be output generated
from it. The source SHALL be square and fully self-contained: no embedded or
referenced raster, no external font, no external URL, no `<text>` element, and no
filter, blur, or drop-shadow primitive — because the mark is rasterised through
`resvg` and downscaled by three different platform toolchains, and anything that
reaches outside the file or depends on filter fidelity does not survive that trip.

#### Scenario: The source is a square, self-contained SVG

- **WHEN** the icon source is inspected
- **THEN** its `viewBox` declares equal width and height, and it contains no
  `<image>`, no `<text>`, no `<filter>`, no `@font-face`, and no reference to any
  URL outside the file

#### Scenario: Generated output carries no hand-authored source

- **WHEN** `src-tauri/icons/` is inspected
- **THEN** it contains no `.svg` file, so the one editable definition of the mark
  is the one under `assets/brand/`

### Requirement: The mark stays inside the product's declared brand palette

The icon SHALL introduce no colour that the theme token system does not already
declare. Its backplate SHALL be filled with the gradient declared as
`--accent-gradient-strong` in `src/styles/tokens.css`, and its foreground SHALL be
pure white. This is the token that exists specifically to carry white at WCAG AA;
the softer `--accent-gradient` SHALL NOT be used, because white on its light stop
measures 3.64:1 and fails.

#### Scenario: The backplate gradient is the token gradient

- **WHEN** the gradient stops declared in the icon source are compared with the
  `--accent-gradient-strong` declaration in `src/styles/tokens.css`
- **THEN** they are the same two colour values, so re-tuning the token and
  forgetting the icon fails the test suite and names the drift

#### Scenario: The foreground clears WCAG AA against every point of the plate

- **WHEN** the contrast ratio between the icon's foreground colour and each of the
  backplate's gradient stops is computed from the source file
- **THEN** every ratio is at least 4.5:1

#### Scenario: The tile is distinguishable from the surfaces it sits on

- **WHEN** the contrast between the icon's outermost edge and both the
  application's dark base and its light base is computed
- **THEN** each is at least 3:1

#### Scenario: The tile edge survives the darkest chrome it ships against

- **WHEN** the icon's outermost edge is composited and measured against the
  darkest desktop chrome the icon is documented to land on, which is darker than
  either application base
- **THEN** the result is at least 3:1 — a bar the backplate colour alone does not
  clear, so the light inset rim that carries it cannot be thinned or deleted
  without failing the test suite

### Requirement: The mark's construction is held to its specification

The generated `icon.ico` carries a 16×16 frame, which Windows renders in the
taskbar and the Alt-Tab switcher, so 16px is a shipping surface rather than an
edge case. The mark's stroke weight SHALL therefore be at least 12.5% of the
canvas, so that no shipped frame renders the mark thinner than 2 device pixels.

The mark's defining feature is that one band passes over the other through a mask
knockout. That weave SHALL be wired to exactly one of the two bands — applied to
both, or to neither, the mark silently becomes a plain overlapping X while every
other check still passes.

#### Scenario: Stroke weight cannot silently drop below the floor

- **WHEN** the stroke width of the mark is read from the source and expressed as a
  fraction of the canvas
- **THEN** it is at least 12.5%, and a change that thins the mark past that point
  fails the test suite

#### Scenario: The weave is wired to exactly one band

- **WHEN** the icon source is inspected
- **THEN** it declares a mask, and exactly one of the two bands references it

### Requirement: The macOS icon follows the platform's icon grid

`tauri icon` applies no platform-specific inset — it renders the source verbatim
into every slot — so a full-bleed tile ships on macOS as an un-inset square that
reads visibly larger and squarer than the icons beside it. A second source SHALL
therefore declare the same mark inset to the macOS icon-grid body ratio, and
`icon.icns` SHALL be produced from that source rather than from the full-bleed
master.

#### Scenario: A separate macOS source declares the inset body

- **WHEN** the macOS icon source is inspected
- **THEN** it declares the same canvas as the master and insets the tile to the
  macOS icon-grid body ratio, leaving the surrounding canvas transparent

#### Scenario: The macOS slot is recorded as built from the macOS source

- **WHEN** the generation record written alongside the icon set is inspected
- **THEN** it attributes `icon.icns` to the macOS source and every other slot to
  the full-bleed master, so the attribution is what the generator actually did
  rather than what a script appears to say

#### Scenario: A failed macOS pass cannot leave a full-bleed icns behind

- **WHEN** the second generator pass produces no usable `icon.icns`
- **THEN** generation exits non-zero rather than leaving the master's full-bleed
  icns in place, because a silently skipped copy is indistinguishable in the
  committed output from a correct run

### Requirement: Every declared icon slot is filled and no framework artwork remains

Every path listed in `bundle.icon` in `src-tauri/tauri.conf.json` SHALL exist, and
every generated PNG SHALL carry the pixel dimensions expected of it. Note that
those dimensions are not always a literal reading of the filename: `128x128@2x.png`
is 256×256, because `@2x` is a scale factor rather than a size, and `icon.png`
(512×512) and `StoreLogo.png` (50×50) encode no size in their names at all. The
expected size of every generated raster SHALL therefore be declared explicitly
rather than parsed out of its filename. No committed icon file SHALL still be the
stock Tauri artwork the project was scaffolded with. Output for platforms the
project does not ship — Android and iOS — SHALL NOT be committed.

#### Scenario: The bundle icon list resolves

- **WHEN** the paths listed in `bundle.icon` are resolved against the repository
- **THEN** each names a file that exists

#### Scenario: Each raster matches its declared size

- **WHEN** the pixel dimensions recorded in each generated PNG's header are read
- **THEN** they match that file's explicitly declared expected size — including
  the two files that carry no size in their name and the one whose name is a
  scale factor — so a truncated or mis-scaled regeneration cannot be committed
  unnoticed

#### Scenario: No stock framework icon survives

- **WHEN** the digest of each committed icon file is compared with the digest of
  the stock Tauri file it replaced
- **THEN** none of them matches

#### Scenario: Unshipped platform output is not committed

- **WHEN** `src-tauri/icons/` is inspected
- **THEN** it contains no Android or iOS output directory, because the project
  ships desktop targets only

### Requirement: A stale icon set fails verification

Regenerating the icons SHALL be a single command, and the repository SHALL record
which source the committed rasters were generated from. The verification suite
SHALL fail when the recorded source no longer matches the source in the tree, so
that editing the mark and forgetting to regenerate is a build failure rather than
something noticed later in a screenshot.

#### Scenario: An edited source without regeneration fails the gate

- **WHEN** an icon source SVG is changed and the icons are not regenerated
- **THEN** the icon check exits non-zero and names the source that drifted

#### Scenario: The gate runs as part of the standard verification suite

- **WHEN** `npm run verify` is inspected
- **THEN** it runs the icon check, so the gate cannot be satisfied only by
  remembering to run it
