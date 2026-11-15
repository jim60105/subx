# app-icon Specification

## Purpose

The application's brand mark: an SVG source of truth under `assets/brand/`, the platform icon set generated from it, the identity and legibility constraints the mark must satisfy, and the gate that keeps generated output in step with its source.

## Requirements

### Requirement: The application icon is generated from a committed vector source

The repository SHALL hold the brand mark as hand-authored SVG under
`assets/brand/`, and every file under `src-tauri/icons/` SHALL be generated from
it. The source SHALL be square and self-contained: no raster, external font,
external URL, `<text>`, filter, blur, or drop shadow, since the mark is rasterised
through `resvg` and downscaled by three platform toolchains.

#### Scenario: The source is a square, self-contained SVG

- **WHEN** the icon source is inspected
- **THEN** its `viewBox` declares equal width and height, and it contains no
  `<image>`, no `<text>`, no `<filter>`, no `@font-face`, and no reference to any
  URL outside the file

#### Scenario: Generated output carries no hand-authored source

- **WHEN** `src-tauri/icons/` is inspected
- **THEN** it contains no `.svg` file, so the one editable definition of the mark
  is the one under `assets/brand/`

### Requirement: The mark's construction is held to its specification

The mark's stroke weight SHALL be at least 12.5% of the canvas, since the
generated `icon.ico` carries a 16×16 frame shipped to the Windows taskbar and the
Alt-Tab switcher, and no shipped frame may render the mark thinner than 2 device
pixels. The weave SHALL be a mask knockout wired to exactly one of the two bands:
wired to both or to neither, the mark silently degrades to a plain overlapping X
while every other check still passes.

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
every generated PNG SHALL carry its declared pixel dimensions, declared explicitly
rather than parsed from the filename: `128x128@2x.png` is 256×256, while
`icon.png` and `StoreLogo.png` encode no size at all. No committed icon SHALL be
the stock Tauri artwork, and no Android or iOS output SHALL be committed.

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

### Requirement: The mark's colours are brand constants declared in its source

The icon's colours SHALL be brand constants declared in its committed vector sources, not values derived from the UI theme tokens. The backplate SHALL be one two-stop brand gradient, identical in every source that draws a plate, and the foreground SHALL be pure white. The white foreground SHALL meet WCAG AA on every point of the plate, and the tile's edge SHALL stay distinguishable from the application's window backgrounds and the darkest chrome it ships against.

#### Scenario: Every icon source declares the same brand gradient

- **WHEN** the backplate gradient stops of the master source and of every other icon source that draws a plate are read from the files
- **THEN** each declares the same two opaque colour values in the same order, so re-tinting one source and forgetting another fails the test suite and names the drift

#### Scenario: The foreground clears WCAG AA against every point of the plate

- **WHEN** the contrast ratio between the icon's foreground colour and each of the backplate's gradient stops is computed from the source file
- **THEN** every ratio is at least 4.5:1

#### Scenario: The tile is distinguishable from the surfaces it sits on

- **WHEN** the contrast between the icon's outermost edge and the window background of each application theme, as declared in the token file, is computed
- **THEN** each is at least 3:1

#### Scenario: The tile edge survives the darkest chrome it ships against

- **WHEN** the icon's outermost edge is composited and measured against the darkest desktop chrome the icon is documented to land on, which is darker than either application base
- **THEN** the result is at least 3:1 — a bar the backplate colour alone does not clear, so the light inset rim that carries it cannot be thinned or deleted without failing the test suite
