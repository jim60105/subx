## Context

SubX ships the stock Tauri logo. `src-tauri/icons/` holds the framework's default
yellow-and-cyan interlocking rings, and the published `v0.1.0` installers carry
them on every platform. The icon is also the only shipped asset with no source of
truth in the repository — the raster set was copied in whole, so there is nothing
to edit and nothing to review.

The product, meanwhile, already has a deliberate identity. `src/styles/tokens.css`
adopts the official Rust programming language palette (`--accent-from #e05d26` →
`--accent-to #b7410e` at 135°), and `src/components/icons/TaskIcons.tsx` sets the
in-app icon rhythm: one uniform stroke, round caps, round joins, no tapers. The
app icon must join that system rather than start a second one.

**Constraints that shaped everything below** (each verified empirically, see
Decisions):

- `tauri icon` rasterises SVG through `resvg` and applies **no** platform-specific
  padding, masking, or inset. Whatever the SVG says is what every slot gets.
- Its output is byte-reproducible for **every PNG and for `icon.ico`**, but *not*
  for `icon.icns`.
- The generated `icon.ico` carries 16, 24, 32, 48, 64 and 256px frames — 16px is a
  shipping surface, not a corner case.
- The project ships **desktop only**: the release workflow builds macOS arm64/x64,
  Linux x64/arm64 and Windows x64. There is no mobile target.
- CI runs on `ubuntu-latest` only, and there is no PR flow — `npm run verify` is
  the real gate.

## Goals / Non-Goals

**Goals:**

- A hand-authored SVG that is the single, reviewable source of truth for every
  platform icon slot.
- A mark that is distinctive in a dock full of media tools, legible at 16px, and
  measurably accessible against the surfaces it actually lands on.
- A regeneration command and a verification gate that make a stale icon set a
  build failure rather than a thing someone notices in a screenshot.
- A colour system that introduces **zero** new brand colours.

**Non-Goals:**

- Putting the mark in the app UI (`AppHeader` keeps its text-only brand block),
  the README, or a favicon. Those consume this asset; they are separate changes.
- Android or iOS icon output. The generated `android/` and `ios/` trees are
  discarded, and the empty leftover directories are removed.
- A dark-mode variant of the app icon. No desktop platform themes app icons.
- Animating, theming, or generating the mark at runtime.

---

# Part 1 — Concept design document

## 1.1 Identity direction

SubX is a **precision instrument, not a media player**. It is what you open when
you have forty episodes and forty loose `.srt` files that must be married
correctly, retimed to the frame, and converted without loss. It should feel warm,
exact and faintly industrial — which is why the project borrowed Rust's burnt
orange rather than inventing a pastel. The mark must not look friendly-and-fluffy,
and it must not look like something that plays video.

**The single idea the mark encodes: two tracks meeting.** All four features —
match, convert, sync, translate — are the same act at different altitudes: binding
a subtitle track to a media track. The mark is two caption bands crossing and
**weaving**, one passing over the other, at the exact centre of the tile. That
crossing is simultaneously the moment of alignment and the **X of SubX**. Nothing
else is in the icon.

## 1.2 Concept directions considered

### Concept A — "Crossband" *(recommended)*

Two pill-ended bands of identical thickness centred on the tile centre, one
ascending at −45°, one descending at +45°, **deliberately unequal in length at a
1 : 0.70 ratio**. Where they cross, the long band is interrupted by a knockout gap
on both sides of the short band, so the short band passes visibly **over** the long
one and the tile's gradient shows through the break. Round caps. Nothing else.

*Metaphor:* the X of SubX built out of the product's own atom — a caption bar. The
weave is the pairing gesture that `MatchIcon` already draws with two offset blocks
and a connector, compressed into a monogram. The unequal lengths read as "a
timeline crossed by a cue", not as a close button.

*At 16px:* strong. A two-diagonal X is, after a filled disc, the most robust
silhouette at 16px — no horizontal or vertical strokes to fight the pixel grid, so
antialiasing spreads evenly instead of snapping. Bands land at 2.12px, well above
the ~1.5px legibility floor. **Cost:** the weave gap falls to 0.69px and vanishes,
so the mark degrades to a solid X. That degradation is graceful — still on-brand,
still an X — but the distinguishing detail is gone (see §1.5).

*Risk:* "X" is shared territory with X/Twitter and with every close button on
earth. Mitigated by the unequal arms, the pill caps, the weave, and an opaque rust
tile that neither of those has.

### Concept B — "Cue Frame" *(rejected)*

A filled 16:9 rounded "screen" in the upper 62% of the art box with a knocked-out
play triangle, and beneath it two centre-aligned pill caption bars at 100% and 62%
width, mimicking real two-line subtitles.

*Rejected on distinctiveness.* A rounded screen with a play triangle is the single
most-occupied shape in a media dock — VLC, mpv, IINA, Plex, HandBrake, QuickTime,
every browser's `<video>`. It also reads as a generic "document with lines" from
three metres away, which the brief rules out. Separately it fails at 16px: three
stacked bands plus an internal knockout inside an 8px-tall screen, with a ~1px gap
that fills in. It would need a genuinely different 16px drawing, breaking the
single-source-of-truth rule.

### Concept C — "Matched Pair" *(rejected)*

Two identical rounded rectangles offset diagonally and overlapping by about a
third, the lower-right knocked out of the upper-left so they read as interlocking
links. Scales directly from the existing `MatchIcon`.

*Rejected on semantic collision.* Two diagonally-offset rectangles is exactly the
universal **copy / duplicate** glyph, and no amount of colour fixes that. It also
carries strong horizontal and vertical edges that snap badly onto a 16px grid, and
it fills the tile as a lumpy diagonal mass.

## 1.3 Why Concept A wins

| Criterion | Rationale |
| --- | --- |
| **Distinctiveness** | A media dock is full of triangles, cones, film sprockets and rounded screens. Nobody there is a woven X. It is also *nameable* — "the crossed captions" — and a nameable mark is a memorable one. |
| **16px legibility** | The only pure-diagonal candidate. Its worst degradation is the loss of one detail, not the loss of the mark. |
| **Buildability** | Two `<line>` elements, one `<mask>` holding a third, one `<linearGradient>`, one tile path. About 20 lines of hand-written SVG; no boolean ops, no filters, no path arithmetic. Every number derives from four constants. |
| **Brand coherence** | The brand gradient is a **135° diagonal**. Crossband is the only candidate whose own principal axes *are* that diagonal: the gradient axis runs parallel to the short band and perpendicular to the long one, so the long band crosses the gradient's full tonal range and gains depth for free. The round caps carry `TaskIcons.tsx`'s `strokeLinecap="round"` rhythm into the logo. |

**Explicitly rejected refinement:** a third caption bar beneath the X to reinforce
the subtitle metaphor. It dies below 48px, it pushes the X off-centre and breaks
the double symmetry, and it costs the mark ~15% of its size. The metaphor is
already carried by the pill caps and the weave.

## 1.4 Construction spec

### Canvas and grid

| Quantity | Value | % of canvas |
| --- | --- | --- |
| viewBox | `0 0 512 512` | — |
| Geometric centre | `(256, 256)` | — |
| Full-bleed tile | `0,0 → 512,512` | 100% |
| Tile corner radius | **114.5** | **22.36%** |
| macOS body (Big Sur grid, 824/1024) | 412 × 412, centred | **80.47%**, inset 50px per side |
| macOS body corner radius | 92.1 | 22.36% of the body |

The full-bleed corner radius is not arbitrary: 22.36% of the canvas is the same
ratio Apple's icon grid applies to its body (185.4 / 824 = 22.5%), so the tile and
the macOS body are the same shape at two scales.

### The four constants

```
t       = 68     // band thickness             13.28% of canvas
R_long  = 150    // long band cap-centre radius from tile centre
R_short = 105    // short band cap-centre radius   (ratio 0.700)
g       = 22     // weave knockout gap, each side   4.30% of canvas
```

Derived: cap radius `t/2` = **34**; axis offset `R/√2`.

### Foreground geometry

| Element | From | To | Paint |
| --- | --- | --- | --- |
| **Band A** — long, ascending, *the media track* | `(149.93, 362.07)` | `(362.07, 149.93)` | `#ffffff`, stroke-width **68**, `linecap="round"` |
| **Band B** — short, descending, *the subtitle cue* | `(181.75, 181.75)` | `(330.25, 330.25)` | `#ffffff`, stroke-width **68**, `linecap="round"` |
| **Weave mask stroke** — black, inside the mask | `(181.75, 181.75)` | `(330.25, 330.25)` | stroke-width **112** (`t + 2g`), `linecap="butt"` |

Mark bounding box **280.13 × 280.13 = 54.7% of canvas**; long-band outer radius
**184**.

**Draw order:** tile → tile inner rim → Band A carrying `mask="url(#weave)"` →
Band B unmasked on top.

The weave must be a **mask**, not a gap painted in a flat colour: the plate is a
gradient, so a painted gap would not match what is behind it.

### Backplate

- Rounded square `0,0,512,512`, corner radius `114.5`. A plain `<rect rx="114.5">`
  is what ships; a true continuous-corner squircle path is a later polish item
  (see Open Questions) and is indistinguishable below 128px.
- Fill: the app's own AA-safe gradient, i.e. **`--accent-gradient-strong`** from
  `tokens.css` — not `--accent-gradient`.

  ```
  <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">   <!-- TL→BR = CSS 135deg -->
    <stop offset="0" stop-color="#c64916"/>
    <stop offset="1" stop-color="#b7410e"/>
  </linearGradient>
  ```

- **Inner rim (required):** an inset stroke on the tile path,
  `stroke="#ffffff" stroke-opacity="0.16" stroke-width="6"`, drawn inside the
  tile. It composites to ≈`#cf663b` at the top edge. This exists solely to fix a
  measured failure — see §1.6. No bottom shadow rim; it costs more than it buys
  and muddies at 32px.
- No drop shadow, no `<filter>`, no bevel, no noise. Filters rasterise
  unpredictably through resvg and the Windows ICO downscaler.

### Stroke weight versus the app's line-icon rhythm

`TaskIcons.tsx` runs `strokeWidth 1.8` on a 24 box = **7.5% of its own box**.
Applying 7.5% here would give a 21px band → 0.66px at 16px, i.e. invisible. The
mark therefore runs at **24.3% of its own bounding box (13.28% of canvas)**, about
3.2× the UI ratio — the normal relationship between a brand mark and a UI icon.
The rhythm is inherited through *shape language*, not through the number: one
uniform weight, round caps, round joins, no tapers.

**Hard floor: `t` never drops below 64 (12.5% of canvas)**, which is the 2.0px-at-
16px line.

### Optical alignment

- **Do not apply the usual "raise the mark 2%" correction.** That rule exists for
  marks with asymmetric vertical mass. Crossband is symmetric about both axes, so
  geometric centre *is* optical centre. Mark centre = `(256, 256)`, exactly.
- **The junction is intentionally lighter than the arms.** Two equal-weight bands
  crossing at 90° normally produce a heavy knot — the problem letterform designers
  solve by thinning strokes into the joint. The 112-wide weave knockout removes
  that mass. This is correct; do not "fix" it by narrowing `g`.
- **Pixel-grid snapping:** all four cap centres land on sub-pixel positions. That
  is desirable for diagonals — snapping them to integers would force the bands off
  45° and produce visibly unequal arm weights. Only the tile edges need integer
  alignment, and they have it.
- **Corner clearance is a non-issue.** Along the up-right diagonal the tile
  boundary sits 314.6 from centre; the long band's cap outer edge sits at 184.
  Clearance is **130.6px**. No constraint here, at any plausible `t` or `R_long`.

### Platform variants

One geometry, two wrappers. Never re-draw.

| File | Contents | Feeds |
| --- | --- | --- |
| `assets/brand/subx-icon.svg` (master) | Full-bleed tile as specified | every PNG and `icon.ico` |
| `assets/brand/subx-icon-macos.svg` | Transparent 512 canvas; the *identical* master group wrapped in `<g transform="translate(256,256) scale(0.80469) translate(-256,-256)">` — yielding a 412 body, radius 92.1, band 54.7, `R_long` 120.7: the Big Sur grid exactly | `icon.icns` only |

Scaling the group scales stroke widths with it, so nothing is re-derived.

## 1.5 Simplification ladder

| Size | Band | Weave gap | Rim | Corner | Reads? |
| --- | --- | --- | --- | --- | --- |
| 1024 | 136.00 | 44.00 | 12.00 | 229.00 | everything |
| 512 | 68.00 | 22.00 | 6.00 | 114.50 | everything |
| 256 | 34.00 | 11.00 | 3.00 | 57.25 | everything |
| 128 | 17.00 | 5.50 | 1.50 | 28.62 | weave clearly reads |
| 64 | 8.50 | 2.75 | 0.75 | 14.31 | weave reads as a notch; rim now sub-pixel, harmless |
| 48 | 6.38 | 2.06 | 0.56 | 10.73 | last size where the weave is honestly legible |
| 32 | 4.25 | 1.38 | 0.38 | 7.16 | weave becomes a grey smear |
| 24 | 3.19 | 1.03 | 0.28 | 5.37 | solid X |
| 16 | 2.12 | 0.69 | 0.19 | 3.58 | solid X, still unmistakably the mark |

**Decision: one master SVG serves every size. No small-size variant in v1.**

A dedicated `icon-small.svg` (thicker bands, weave removed, flat plate) would buy
roughly 18% more stroke weight at 16px. It was rejected for v1 because `tauri icon`
offers no per-frame source, so shipping it means hand-assembling `icon.ico` from
two render passes — a bespoke ICO writer, its own tests, and its own share of the
85% coverage floor — for a detail-level gain on a mark that already degrades
gracefully. Recorded as a deferred follow-up with a concrete trigger: **if a 16px
review on a Windows taskbar shows a smudge rather than a crisp X, build it.**

## 1.6 Colour and measured contrast

Every ratio below is WCAG 2.1 relative luminance, computed against the **actual**
plate colour at that point, and verified numerically.

| Role | Hex | Against | Ratio | Bar | Verdict |
| --- | --- | --- | --- | --- | --- |
| Mark | `#ffffff` | plate light stop `#c64916` | **4.81:1** | ≥4.5 | **PASS** (worst case anywhere on the mark) |
| Mark | `#ffffff` | plate midpoint `#be4512` | 5.19:1 | ≥4.5 | PASS |
| Mark | `#ffffff` | plate dark stop `#b7410e` | 5.56:1 | ≥4.5 | PASS |
| Rim (composited ≈`#cf663b`) | — | Win11 dark taskbar `#202124` | **4.31:1** | ≥3 | PASS |
| Plate `#b7410e` | — | Win11 dark taskbar `#202124` | 2.89:1 | ≥3 | **FAIL — this is why the rim exists** |
| Plate `#b7410e` | — | app dark base `#141518` | 3.28:1 | ≥3 | PASS |
| Plate `#b7410e` | — | app light base `#f9f8f6` | 5.24:1 | ≥3 | PASS |

The gradient is monotonic between its stops, so no interior point is worse than
the light stop. **Worst case on the mark: 4.81:1, 7% of headroom.**

**Rejected colour options, with their measured failures:**

| Candidate | Measurement | Verdict |
| --- | --- | --- |
| `--accent-gradient` (`#e05d26 → #b7410e`) as the plate | white on `#e05d26` = **3.64:1** | fails AA. `--accent-gradient-strong` exists in `tokens.css` for exactly this reason. |
| Charcoal plate with an orange mark | `#b7410e` on `#141518` = **3.28:1** | fails the 4.5:1 fine-detail bar; fixing it needs `#ff8c5a`, which is outside the brand gradient |
| Warmed-off-white mark `#fff3ea` | 4.41:1 | fails |
| Warmed-off-white mark `#fff8f3` | 4.57:1 | passes with 0.07 headroom — antialiasing at 32px eats it |
| `#f9f8f6` (app light base) as the mark | 4.53:1 | technically passes; must be re-measured if the plate ever moves |

**The strongest argument for white-on-orange rather than orange-on-charcoal** is
camouflage resistance. On a mid-grey wallpaper (`#808080`) the plate itself
measures only **1.41:1** and effectively disappears — but the white mark still
reads at **3.95:1** against that grey. A white mark survives its own plate being
camouflaged; an orange mark on a dark plate would vanish along with it.

## 1.7 Monochrome and theme variants

One file, `assets/brand/subx-mark-mono.svg`: **the two bands only**, `fill: none;
stroke: currentColor`, no plate, no rim, **no weave knockout** — on a transparent
background there is nothing behind the gap for it to reveal, so the knockout would
just cut a hole in the mark. Same viewBox and same constants, so it stays in
register. Because it loses its plate it should be drawn at **1.15×** about the
centre, so it fills a transparent square the way the full mark fills its tile.

| Context | Colour | Background | Ratio |
| --- | --- | --- | --- |
| App light theme | `--accent-text` `#b7410e` | `#f9f8f6` | 5.24:1 |
| App dark theme | `--accent-text` `#ff8c5a` | `#141518` | 7.96:1 |
| README, GitHub light | `#b7410e` | `#ffffff` | 5.56:1 |
| README, GitHub dark | `#ff8c5a` | `#0d1117` | 8.25:1 |

Because it uses `currentColor`, theme behaviour is free — it follows the existing
`data-theme` flip with no extra CSS and no second asset. Do **not** ship a single
mid-orange that "works on both": `#e05d26` is 5.01:1 on `#141518` but only 3.43:1
on `#f9f8f6`.

This file is authored now because it costs one extra `<g>`, but nothing in this
change consumes it — the README and `AppHeader` work is separate.

## 1.8 Do / Don't

**Do**

- Keep the plate opaque and full-bleed. The mark must never rely on the desktop
  background showing through.
- Keep exactly one stroke weight across the whole mark, round caps, round joins.
- Keep both bands pure `#ffffff`.
- Keep the mark doubly symmetric and geometrically centred.
- Re-measure every ratio in §1.6 if any plate stop changes, even by one value.
- Treat every raster as build output, never as an editable asset.

**Don't**

- **No gradient on the bands.** Invisible above 128px, per-pixel colour noise at
  32px and below. The gradient belongs to the plate and only the plate.
- **No text, no letterforms** — no "SubX", no "CC", no ".srt". Type in an app icon
  is unreadable below 64px and instantly dates the mark.
- **No third element** — no caption bar under the X, no timeline ticks, no play
  triangle, no inner frame.
- **No filters** — no `feDropShadow`, `feGaussianBlur`, `feColorMatrix`, no
  `filter:`. They rasterise inconsistently across resvg, `iconutil` and the
  Windows ICO downscaler.
- **No raster embeds, no `<image>`, no external fonts, no `@import`.**
- **No transparency in the plate.** (The macOS variant's *canvas* is transparent;
  the tile on it is not.)
- **Don't tighten `g` below 22** to make the weave subtler — it is already at its
  48px legibility floor.
- **Don't square off the corners at 16px.** 3.58px of radius is what separates "app
  tile" from "colour swatch".
- **Don't hand-edit `icon.ico`, `icon.icns`, or any generated PNG.**

---

# Part 2 — Descriptive prompt (English, natural language)

For briefing an external designer or a text-to-image model. It describes the
recommended mark and nothing else.

> A flat vector app-icon design on a square 1:1 tile: a rounded square with
> generous, evenly curved corners, filled edge to edge with a warm burnt-orange
> linear gradient running diagonally from a lighter scorched orange in the
> top-left corner to a deep terracotta in the bottom-right. Centred on the tile,
> two thick pure-white bars with fully rounded ends cross each other at right
> angles along the diagonals to form a bold X — the ascending bar noticeably
> longer than the descending one, and the shorter bar passing cleanly over the
> longer, which is interrupted by an even gap on either side so the orange
> gradient shows through the break like a woven ribbon. One uniform stroke weight
> throughout, hard-edged geometry, no outlines, no shading, no drop shadow, no
> bevel, no texture. Generous negative space around the mark, a strictly
> two-colour palette of orange and white, a single faint white hairline running
> just inside the tile's edge, and no letters, numbers or words anywhere in the
> image.

**Notes**

- Aspect ratio 1:1; brief at 1024×1024 or larger.
- The prompt deliberately says "bars forming an X" rather than naming a letter —
  the mark is geometry, and naming a letter invites a rendered glyph.
- Variation worth asking for: the same tile with the weave omitted, to preview how
  the mark degrades at 16px.

---

# Part 3 — Technical decisions

### D1 — The SVG is the source of truth, and it lives outside the output directory

`assets/brand/` holds the hand-authored files; `src-tauri/icons/` holds only
generated output. **Alternative considered:** putting the SVG in `src-tauri/icons/`
next to the rasters. Rejected — a directory that mixes a hand-edited source with
its own build output invites someone to edit the wrong one, and it makes "delete
and regenerate" unsafe.

### D2 — Two source SVGs, because `tauri icon` applies no macOS inset

Verified: the `ic10` (1024px) member extracted from a generated `icon.icns` is the
source SVG rendered verbatim, with no added padding. A full-bleed tile therefore
renders on macOS as an un-inset square that sits visibly larger and squarer than
every neighbouring Big Sur icon. The fix is a second source at the 824/1024 body
ratio and a second generator pass whose `icon.icns` is copied over the first
pass's.

**Alternative considered:** shipping one full-bleed source everywhere. Rejected —
it is a permanent, visible quality defect on one of three shipping platforms, and
the fix costs one `<g transform>` and two lines of script.

**Alternative considered:** insetting the master and letting Windows/Linux inherit
macOS's margins. Rejected in the other direction — Windows and Linux do not
compensate for a square-versus-circle size illusion, so an inset tile reads as
undersized in a taskbar.

**Verifying that the second pass actually happened.** `icon.icns` is not
byte-reproducible (D5), so it cannot be diffed. Two cheap checks stand in: the
generator records which source fed which output in its generation record, and the
copy step fails loudly if the second pass produced no usable icns rather than
leaving the master's full-bleed one in place. Neither inspects pixels. The
strongest check available — extracting the icns `ic10` member and asserting its
non-transparent bounding box sits near the 412/512 inset ratio — is **deferred**,
because it needs a PNG decoder (inflate plus scanline un-filtering) in `scripts/`,
which then carries its own share of the 85% coverage floor. Worth building if the
macOS icon ever ships wrong despite the two checks above.

### D3 — Desktop-only output; `android/` and `ios/` are discarded

`tauri icon` generates 19 Android files and 18 iOS files that this project does not
ship. They are deleted after generation, and the empty `src-tauri/icons/android/`
and `ios/` shells left by an earlier run are removed.

**Consequence for the geometry:** the Android adaptive-icon 66% safe circle
(r = 169) is *not* a binding constraint, which is why `R_long` is 150 (mark at
54.7% of canvas) rather than the 134 (50.3%) it would need to be under that
constraint. If Android is ever added, compliance is a single wrapper —
`scale(0.9185)` about the centre — not a redraw. This is recorded here so the
number is not rediscovered later.

### D4 — `64x64.png` is kept and added to `bundle.icon`

The generator produces it and Tauri's Linux packagers install each listed PNG into
`hicolor/<w>x<h>`. Listing it costs nothing and gives Linux panels one more exact
size instead of a downscale. This is the only edit to `tauri.conf.json`.

### D5 — The freshness gate is a source digest, not a regenerate-and-diff

`icons:generate` writes a generation record, `src-tauri/icons/.icon-source.json`,
holding the SHA-256 of each source SVG and the source each output slot was
produced from. `icons:check` recomputes those digests and fails on mismatch — the same shape of promise as `bindings:check`, catching the realistic
failure: *the SVG was edited and the icons were not regenerated.*

**Alternative considered and measured:** regenerating into a temp directory and
byte-comparing against the committed set, exactly like `bindings:check`. Two runs
of `tauri icon` from an identical source were compared file by file:

| Output | Reproducible? |
| --- | --- |
| Every PNG (`32x32`, `128x128@2x`, `Square*Logo`, …) | **byte-identical** |
| `icon.ico` | **byte-identical** |
| `icon.icns` | **71,953 of ~74,000 bytes differ between runs** |

The `icns` divergence is not a timestamp — member ordering and packing change per
run. So the strong gate is *possible* but only for a subset, and only as far as
one platform and one CLI version can be trusted; CI is `ubuntu-latest`-only, but
contributors are not. Rejected for v1 as more machinery and more false failures
than the risk warrants. **The measurement is recorded here so a future change can
upgrade the gate cheaply** — a PNG-and-ICO-only byte diff is known to work on
Linux.

Alongside the digest, `scripts/app-icon.test.ts` asserts structural properties
directly — that the committed rasters exist at their declared pixel dimensions,
and that none of them is still the stock Tauri artwork.

**Declared, not inferred, dimensions.** `tauri icon`'s filenames are not a
reliable statement of size: `128x128@2x.png` is 256×256 (`@2x` is a scale factor),
and `icon.png` (512×512) and `StoreLogo.png` (50×50) carry no size at all. The
expected size of each file is therefore a table in the test, not a regex over its
name. Measured against the current committed set, that table is:

```
32x32.png 32 · 64x64.png 64 · 128x128.png 128 · 128x128@2x.png 256 · icon.png 512
StoreLogo.png 50 · Square30x30Logo.png 30 · Square44x44Logo.png 44
Square71x71Logo.png 71 · Square89x89Logo.png 89 · Square107x107Logo.png 107
Square142x142Logo.png 142 · Square150x150Logo.png 150 · Square284x284Logo.png 284
Square310x310Logo.png 310
```

### D6 — The source SVG is held to the token palette by test, not by convention

`tokens.colorLiteral.test.ts` already stops hard-coded colours in CSS; nothing
would stop the icon drifting out of the brand. `scripts/app-icon.test.ts` asserts
that the two plate stops in the SVG are exactly the two stops declared for
`--accent-gradient-strong` in `tokens.css`, and computes the white-on-plate
contrast ratio from the file rather than trusting a comment. If someone changes
the token, the icon test fails and names the drift.

**The parse is two-step, not one.** The declaration is
`--accent-gradient-strong: linear-gradient(135deg, #c64916, var(--accent-to));` —
one literal hex and one `var()` reference that must be resolved against
`--accent-to`'s own declaration elsewhere in the file. A single regex over the
`--accent-gradient-strong` line finds only one colour and would silently check
half of what this decision promises. The resolver must follow the indirection.

### D7 — Scenario coverage lives in `scripts/`, following the release-pipeline pattern

`scripts/release-config.test.ts` already verifies workflow-YAML scenarios by
parsing a checked-in file. The icon's scenarios are verified the same way, by
parsing the SVG and the generated set. No waivers are needed: every scenario in
this change's spec is mechanically checkable. Note that `vite.config.ts` counts
`scripts/**/*.mjs` toward the 85% coverage floor, so `scripts/check-icon-source.mjs`
needs its own tests, not just the assertions it powers.

## Risks / Trade-offs

- **The mark degrades to a plain X at 16 and 24px** → Accepted and documented in
  §1.5, with a concrete trigger for building the small-size variant. The
  degradation keeps the silhouette, the colour and the brand.
- **"X" is crowded iconographic territory** → Mitigated by unequal arms, pill
  caps, the weave, and an opaque rust tile. Worth an explicit look at the built
  icon beside X/Twitter in a real dock before release.
- **The digest gate does not notice a hand-edited PNG whose source is untouched**
  → Partially covered by D5's structural assertions (dimensions, not-stock-Tauri).
  Full coverage needs the regenerate-and-diff gate, which is deferred with its
  feasibility already measured.
- **A `@tauri-apps/cli` upgrade may change raster output** → Harmless under the
  digest gate (it watches sources, not outputs). It would matter under the
  deferred strong gate; note it there if that gate is ever built.
- **The rim is a 6px stroke doing accessibility work that is sub-pixel below 64px**
  → Accepted. Its job is the Windows 11 dark taskbar, where the icon renders at
  ≥ 32px in the taskbar and larger in Alt-Tab; below that it simply fades out.
- **`resvg` and `iconutil` may render the `<mask>` differently at extreme
  downscales** → Low risk (a mask is a straightforward alpha multiply), but the
  16px and 32px renders must be inspected by eye before the change is archived,
  not merely asserted by dimension checks.
- **Existing installs may keep showing the old icon** until each OS's icon cache
  expires → Not fixable from here; call it out in the release notes.

## Migration Plan

No data, config, or API migration. Ordering:

1. Author the three SVGs and verify the rendered result by eye at 512, 128, 64,
   32 and 16px before wiring anything.
2. Add `icons:generate`, run it, and commit the regenerated set together with the
   digest file — sources and outputs land in one commit so the tree is never in a
   state the gate rejects.
3. Add `icons:check` to `verify`, add the tests, sync the spec, run
   `npm run verify`.

**Rollback:** revert the commit. The stock icons return with it, and nothing else
in the app reads these files.

## Open Questions

1. **Squircle or `rx`?** A true continuous corner needs a generated ~16-segment
   cubic path that is hostile to hand-editing, and the difference is invisible
   below 128px. Shipping `rx` for v1; worth revisiting when the macOS build is
   polished. *Needs a maintainability-versus-fidelity call.*
2. **Should the in-app `AppHeader` gain the mark?** Recommended — a 28px tile
   beside the wordmark would anchor a brand block that is currently text-only, and
   at 28px the weave still reads. Out of scope here; it touches `AppHeader.tsx`,
   its tests, and an `alt`/`aria-hidden` decision (the mark sits beside visible
   `appName` text, so it must be `aria-hidden`, not labelled). *Separate change.*
3. **Is `#ffffff` at 4.81:1 enough headroom, or should the plate darken?** Moving
   the light stop from `#c64916` toward `#b7410e` would raise the floor but flatten
   the gradient the mark relies on for depth. Shipping as specified; flagged
   because 7% of headroom is thin if the palette is ever re-tuned.
