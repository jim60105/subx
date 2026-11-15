# Design: editorial-visual-foundation

## Context

Source of truth: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("Visual foundation"). Reference mockup (git-ignored, read-only): `.superpowers/brainstorm/3955151-1794685630/content/editorial-uoq-v2.html`. Where they disagree the design document wins (notably `--ink-3`).

Observed current state:

- `src/styles/tokens.css` declares the legacy tokens; 26 other stylesheets (about 2,800 lines) reference them. Fourteen of those use `backdrop-filter`, gradients, or shadows.
- `tokens.colorLiteral.test.ts` forbids colour literals outside `tokens.css`; `tokens.contrast.test.ts` composites translucent surfaces and checks gradients. Both carry `// @covers theme-system/dual-light-dark-themes-with-neon-gradient-identity#both-themes-render-every-shell-screen`.
- `layout.test.ts` asserts stylesheet text (jsdom applies no CSS); it covers the 2 × 2 home grid and the header tagline truncation.
- `hardCodedStrings.test.tsx` fails on any rendered text containing letters that is not a translation key or in its `ALLOWED` list, and on any key-shaped text when rendered in a real language.
- `AppHeader` renders the brand (name + tagline) as a button off the hub; `App.tsx` passes `onNavigateHome` / `onOpenSettings`. `WizardShell` renders a pill stepper with `✓` for completed steps and a visible counter. `HomeScreen` renders four `TaskCard`s in a grid.
- No font is bundled. `index.html` references no remote resource. The CSP already allows `font-src 'self' data:`.
- jsdom has no layout and applies no stylesheet, so every scenario is established through DOM structure, ARIA, or stylesheet text — the project's existing convention.

## Goals / Non-Goals

**Goals:**

- One token file, one serif rule, one button stylesheet; no legacy token survives anywhere.
- Mechanism tests that make the identity rules (no glass, no gradient, square corners, declared tokens, covered glyphs) fail loudly.
- Breadcrumb, stepper, buttons, and home list in their final markup, so later changes do not touch them again.

**Non-Goals:**

- Restructuring any wizard step or the Settings screen. Their markup, props, and locale keys stay as they are; only their stylesheets change. (Later changes: `redesign-match-sources`, `redesign-match-review`, `redesign-match-analysis-execute`, `show-convert-translate`, `show-sync-settings`.)
- New animation. Existing transitions keep working; `prefers-reduced-motion` handling in `global.css` is unchanged.
- Subsetting the font, bundling a sans or mono font, or adding font weights.
- Any change under `src-tauri/`, to IPC, to `config.toml`, or to theme storage.
- Backwards-compatible token aliases. The app is pre-release; old names are removed outright.

## Decisions

### D1: Token file (verbatim contract)

`src/styles/tokens.css` is replaced with exactly this file content (plus a header comment). Spacing, text-size, control-height, motion, and titlebar tokens keep their current names and values and are written out in full below.

```css
:root {
  /* Typography */
  --font-serif: "UoqMunThenKhung", serif;
  --font-sans: system-ui, sans-serif;
  --font-mono: ui-monospace, monospace;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.875rem;
  --text-3xl: 2.75rem;
  --text-4xl: 3.625rem;

  /* Spacing scale */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;

  /* Control heights: the authority for control min-heights. */
  --control-height: 36px;
  --control-height-lg: 44px;

  /* Shape: controls only. Containers declare no radius. */
  --radius-control: 2px;

  /* Motion — respected unless the user asks for reduced motion. */
  --motion-fast: 120ms;
  --motion-base: 200ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);

  /* Titlebar window controls */
  --titlebar-btn-size: var(--control-height);
  --titlebar-close-hover: var(--del);
  --titlebar-btn-gap: 0px;
}

:root[data-theme="light"] {
  color-scheme: light;
  --paper: #f7f4ee;
  --paper-2: #efeae0;
  --ink: #1a1713;
  --ink-2: #57504a;
  --ink-3: #6b645b;
  --hair: #d6d0c4;
  --accent: #c23b12;
  --accent-ink: #b23510;
  --on-ink: #f7f4ee;
  --add: #2f6b3f;
  --del: #b3261e;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --paper: #131210;
  --paper-2: #1c1a17;
  --ink: #ebe5db;
  --ink-2: #b0a89c;
  --ink-3: #8f877b;
  --hair: #34302b;
  --accent: #ff7648;
  --accent-ink: #ff8a62;
  --on-ink: #131210;
  --add: #7fc893;
  --del: #ff8d86;
}
```

All eleven colours are opaque hex. The contrast ratios were computed while planning and every pair in D3's table passes (lowest: light `--ink-3` on `--paper-2` = 4.87, dark `--ink-3` on `--paper-2` = 4.89).

*Alternative considered:* keeping legacy names as aliases to shrink the diff. Rejected by the design document ("replaced, not aliased") and because an alias would let glass-era semantics (`--surface`, `--shadow-panel`) survive in new code.

### D2: Legacy token mapping for the stylesheet sweep

Apply to every `*.css` under `src/`, including `PreferenceSelect`, `ErrorNotice`, and `WindowControls`. The sweep's exit check is `npx vitest run src/styles`: `tokens.reference.test.ts` reports every leftover legacy `var(--…)` and `flatness.test.ts` every leftover blur, shadow, gradient, colour mix, or rounded container.

| Legacy | Replacement |
|---|---|
| `--bg-base` | `--paper` |
| `--bg-gradient` | delete the declaration (`background-image`, `background-attachment`) |
| `--surface` as a `background` | delete the declaration (content sits on paper) |
| `--surface-hover` | `--paper-2` |
| `--surface-border` | `--hair` for separators; `--ink-3` for the border of an input, select, or textarea |
| `--surface-border-hover` | `--ink` |
| `--surface-blur` | delete the `backdrop-filter` declaration |
| `--text-primary` | `--ink` |
| `--text-secondary` | `--ink-2` |
| `--text-muted` | `--ink-3` |
| `--text-on-accent` | `--on-ink` |
| `--accent-text` | `--accent-ink` |
| `--accent-gradient`, `--accent-gradient-strong` as a fill | `background: var(--ink); color: var(--on-ink)` |
| `--accent-gradient-soft` | `--paper-2` |
| `--accent-from`, `--accent-to` | `--accent` |
| `--focus-ring` | `--accent` |
| `--danger` | `--del` |
| `--success` | `--add` |
| `--danger-surface`, `--success-surface` | delete the `background`; add `border-inline-start: 2px solid var(--del)` / `var(--add)` and `padding-inline-start: var(--space-3)` |
| `--shadow-panel`, `--shadow-glow`, `--shadow-raised` | delete the `box-shadow` declaration |
| `--radius-sm`, `--radius-md` on a control (button, input, select, textarea, chip, checkbox) | `--radius-control` |
| `--radius-md`, `--radius-lg`, `--radius-pill` on a container (panel, list, section, stepper) | delete the declaration |
| `color-mix(...)` | the nearest token from this table; never a new literal |

Container treatment while sweeping (no card may remain): a rule that drew a box (background + border on four sides + radius) keeps none of the three; rows inside it are separated with `border-bottom: 1px solid var(--hair)`; a section heading gets `border-bottom: 1px solid var(--ink)`. `border-radius: 50%` stays where it draws a circle (radio dot, spinner).

Text inputs, selects, and textareas: `color: var(--ink); background: var(--paper); border: 1px solid var(--ink-3); border-radius: var(--radius-control)`. `--hair` is 1.4:1 against paper and is therefore never the only boundary of an interactive control.

`.gradient-text` is deleted from `global.css` and from `AppHeader.tsx`.

A `transition:` list that names `box-shadow` also matches the flatness test: remove that entry from the list (keep the others).

### D3: Stylesheet mechanism tests

All four read stylesheet text with `fs`, the way `tokens.colorLiteral.test.ts` and `layout.test.ts` already do. Comments are stripped before matching.

1. `src/styles/tokens.contrast.test.ts` — rewritten. Keep `declarationsOf`, `themeTokens`, `resolve`, hex parsing, `relativeLuminance`, `contrastRatio`. Delete `gradientEndpoints`, `over`, `stack`, the `rgba`/`color-mix` branches, `GRADIENT_CHECKS`, `CLIPPED_TEXT_CHECKS`, and the "gradient identity" describe block. The check table is exactly:

   | Foreground | Background | Minimum |
   |---|---|---|
   | `--ink`, `--ink-2`, `--ink-3`, `--accent-ink`, `--add`, `--del` | `--paper` and `--paper-2` (12 pairs) | 4.5 |
   | `--on-ink` | `--ink` | 4.5 |
   | `--on-ink` | `--del` (window close hover) | 4.5 |
   | `--accent` | `--paper` | 3 |

   Add one test: every colour token in both theme blocks parses as a 6-digit hex (the proof is exact only while nothing is translucent), and the dark and light blocks declare the same set of names.
2. `src/styles/tokens.colorLiteral.test.ts` — logic unchanged; only its `@covers` line and the `var(--text-primary)` / `var(--accent-text)` sample strings in its self-check change (`var(--ink)`, `var(--accent-ink)`).
3. `src/styles/tokens.reference.test.ts` — new. Collect every `--name` declared in `tokens.css`. For every `*.css` and non-test `*.tsx` under `src/`, collect every `var(--name` reference; a reference is valid when the name is declared in `tokens.css` or declared in the same file. Offenders are reported as `file → --name`. Include a self-check that a made-up name is reported.
4. `src/styles/flatness.test.ts` — new. Two tests over every `*.css` under `src/` (including `tokens.css`):
   - no declaration matches `backdrop-filter`, `box-shadow`, `text-shadow`, `filter\s*:[^;]*blur`, or `color-mix\(`, and `gradient\(` appears only in the value of a `mask-image` / `-webkit-mask-image` declaration (a mask fades content; it paints no gradient — `redesign-match-sources` uses one for the file list's bottom fade);
   - every `border-radius` / `border-*-radius` value is exactly `var(--radius-control)`, `0`, or `50%`.
   - a third test reads `src/styles/buttons.css`: the `.button--primary` rule declares `background: var(--ink)` and `color: var(--on-ink)`, and no rule in the file has `var(--accent)` in a `background` declaration.
   Each has a self-check proving the matcher can fail.

### D4: Bundled font

- Source: `UoqMunThenKhung-Regular.ttf` and `OFL.txt` from `https://github.com/google/fonts/tree/main/ofl/uoqmunthenkhung` (SIL Open Font License 1.1). Download into the scratch/temp directory; the TTF is never committed.
- Convert without subsetting: `uvx --from "fonttools[woff]" fonttools ttLib.woff2 compress -o src/assets/fonts/UoqMunThenKhung-Regular.woff2 <path-to>/UoqMunThenKhung-Regular.ttf`.
- Commit `src/assets/fonts/UoqMunThenKhung-Regular.woff2`, `src/assets/fonts/OFL.txt`, and `src/assets/fonts/README.md`. The README records: source URL, the `google/fonts` commit SHA the file was taken from, TTF byte size and SHA-256, WOFF2 byte size and SHA-256, the exact conversion command, and the licence name. The WOFF2 size is unmeasured at planning time (TTF is 4.9 MB); the measured number is also copied into `visual-review.md`.
- If the download or conversion is impossible in the worker's environment, stop and report. Do not substitute another font, a subset, or a CDN link.
- `src/styles/fonts.css` (new, imported from `global.css` directly after `tokens.css`):

  ```css
  @font-face {
    font-family: "UoqMunThenKhung";
    src: url("../assets/fonts/UoqMunThenKhung-Regular.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: block;
  }
  ```
- Serif is applied by one rule in `global.css`, and nowhere else:

  ```css
  h1, h2, h3, .serif {
    font-family: var(--font-serif);
    font-weight: 400;
    font-style: normal;
    font-synthesis: none;
  }
  ```
  Non-heading serif text (brand, breadcrumb title, ordinals, large numerals) gets `className="serif"`. During the sweep, delete `font-weight` and `font-style` from every rule whose class is applied to an `h1`–`h3` element in the TSX (find them with `grep -rn "<h[123] className" src`; today that includes `.home__heading`, `.settings__heading`, `.settings-section__title`, and each step's `__title` class) and from every rule whose class is used together with `serif`.
- `src/styles/fontCoverage.test.ts` (new) uses the new devDependency `fontkit` (`fontkit.create(fs.readFileSync(woff2Path)).characterSet`). The file starts with `// @vitest-environment node` (it only reads files, and jsdom's typed-array realm can break WOFF2 decoding) and passes an explicit 30 s timeout to the coverage test. It gathers every string value from `resources` in `src/i18n/index.ts` for every entry of `SUPPORTED_LANGUAGES`, plus the fixed literals components render in serif outside the locale files (`0123456789+−/.,:` — digits, plus, U+2212 minus, slash, full stop, comma, colon), splits into code points, ignores `\n` and `\t`, and expects the list of uncovered characters to be empty (reported as `U+XXXX 'c' in <lang>/<namespace>`). Self-check: a string containing `U+10FFFF` is reported as uncovered. If `tsc --noEmit` reports missing declarations for `fontkit`, add `@types/fontkit` as a devDependency. If `fontkit` cannot read the WOFF2, stop and report; do not weaken the test.
- The same file holds the two stylesheet assertions for the serif scenarios: (a) the `@font-face` `src` URL resolves to an existing file under `src/`, no `url(` or `@import` in any stylesheet under `src/` contains `http:` or `https:`, and `index.html` contains no `<link` and no `http` URL; (b) `var(--font-serif)` occurs in exactly one rule outside `tokens.css`, the `global.css` rule above, and that rule declares `font-weight: 400`, `font-style: normal`, and `font-synthesis: none`.

*Alternative considered:* a committed code-point manifest instead of parsing the font. Rejected: the manifest could drift from the binary, which is the failure the test exists to catch.

### D5: Shared buttons (`src/styles/buttons.css`, imported from `global.css`)

```css
.button {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: center;
  min-height: var(--control-height);
  box-sizing: border-box;
  padding: 0 var(--space-4);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--ink);
  border-radius: var(--radius-control);
  transition:
    background-color var(--motion-fast) var(--ease-out),
    opacity var(--motion-fast) var(--ease-out);
}
.button:not(:disabled):hover { background: var(--paper-2); }
.button--primary {
  min-height: var(--control-height-lg);
  padding: 0 var(--space-5);
  color: var(--on-ink);
  background: var(--ink);
}
.button--primary:not(:disabled):hover { background: var(--ink); opacity: 0.85; }
.button--tertiary { padding-inline: 0; color: var(--ink-2); border-color: transparent; }
.button--tertiary:not(:disabled):hover { color: var(--ink); text-decoration: underline; background: transparent; }
.button:disabled { cursor: not-allowed; opacity: 0.45; }
```

Class changes in TSX. The existing feature class stays as a test and layout hook; its colour, border, radius, and shadow declarations are deleted from the feature stylesheet.

| File | Element | New `className` |
|---|---|---|
| `WizardShell.tsx` | back | `button button--tertiary wizard__button` |
| `WizardShell.tsx` | secondary | `button button--tertiary wizard__button` |
| `WizardShell.tsx` | next | `button button--primary wizard__button wizard__button--primary` |
| `SourcesStep.tsx`, `ConvertSourcesStep.tsx`, `TranslateSourcesStep.tsx` | browse buttons | `button <existing>` |
| `SyncInputsStep.tsx` | browse | `button sync-inputs__button` |
| `SyncInputsStep.tsx` | clear | `button button--tertiary sync-inputs__clear` |
| `SettingsScreen.tsx` | save | `button button--primary settings-button settings-button--primary` |
| `ConnectionTestPanel.tsx` | test | `button settings-button` |

The action bar keeps its three slots and positions; `layout.test.ts`'s action-bar assertions must still pass unchanged.

### D6: Title-bar breadcrumb

`AppHeaderProps` gains `currentTitle?: string` (localized title of the current screen; `undefined` on the hub). Brand markup becomes:

```tsx
<nav className="app-header__crumb" aria-label={t("breadcrumb")}>
  {onNavigateHome ? (
    <button type="button" className="app-header__brand app-header__brand--link serif"
            title={t("actions.home")} onClick={onNavigateHome}>
      <span className="app-header__name">{t("appName")}</span>
      <span className="visually-hidden">{t("actions.home")}</span>
    </button>
  ) : (
    <div className="app-header__brand serif">
      <span className="app-header__name">{t("appName")}</span>
    </div>
  )}
  {currentTitle !== undefined && (
    <>
      <span className="app-header__slash" aria-hidden="true">/</span>
      <span className="app-header__current serif" aria-current="page">{currentTitle}</span>
    </>
  )}
</nav>
```

- `App.tsx` passes `currentTitle={screen === "home" ? undefined : t(TITLE_KEYS[screen])}` with `const TITLE_KEYS: Record<Exclude<ScreenId, "home">, string> = { match: "home:tasks.match.name", convert: "home:tasks.convert.name", sync: "home:tasks.sync.name", translate: "home:tasks.translate.name", settings: "settings:title" }`.
- The settings control becomes a text button: `<button type="button" className="app-header__settings" onClick={onOpenSettings}>{t("actions.settings")}</button>` (no `aria-label`, no icon). `src/components/icons/SettingsIcon.tsx` is deleted.
- `AppHeader.css`: header `background: var(--paper); border-bottom: 2px solid var(--ink)`; no `backdrop-filter`, no shadow. `.app-header__current { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }`, `.app-header__crumb { display: flex; min-width: 0; gap: var(--space-3); align-items: baseline; }`, `.app-header__slash { color: var(--ink-3); }`. `.app-header__version` keeps `flex-shrink: 0; white-space: nowrap; user-select: text` and uses `color: var(--ink-2)`. `.app-header__settings` and the compact `PreferenceSelect` trigger are borderless (`background: none; border: none; color: var(--ink-2)`), `min-height: var(--control-height)`. The `.app-header__tagline` rule is deleted.
- Locale: delete `common.tagline`; add `common.breadcrumb` (`"Breadcrumb"` / `"導覽路徑"`) in both locales.
- `layout.test.ts` "app header build identity" test: replace the tagline assertions with the same five assertions against `.app-header__current` (`overflow: hidden`, `text-overflow: ellipsis`, `min-width: 0`, `white-space: nowrap`) and the badge colour `var(--ink-2)`; drop the `max-width: 16vw` assertion. Its `@covers` ID is unchanged.

### D7: Stepper

In `WizardShell.tsx` the marker renders `String(index + 1).padStart(2, "0")` in every state (no `✓`) with `className="wizard__step-marker serif"`, and the counter becomes `<p className="wizard__counter visually-hidden">`. `stepState`, `data-state`, `aria-current`, and the visually hidden state text are unchanged.

`WizardShell.css`: `.wizard__steps` is a flex row with `gap: var(--space-5)` and `border-bottom: 1px solid var(--hair)`, no background, border box, or radius. `.wizard__step` has `padding-bottom: var(--space-2); margin-bottom: -1px; color: var(--ink-3)`. Active: `color: var(--ink); border-bottom: 2px solid var(--accent)`. Completed: `color: var(--ink-2)` with `.wizard__step-marker { color: var(--accent-ink) }`. The marker has no border, circle, or fixed size. `.wizard__content` keeps `flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden` and loses background, border, radius, shadow, and blur; padding becomes `var(--space-4) 0`.

### D8: Home list

- Delete `src/components/TaskCard/` (three files) and `src/components/icons/TaskIcons.tsx`.
- New `src/components/TaskRow/TaskRow.tsx`, `TaskRow.css`, `TaskRow.test.tsx`:

  ```tsx
  interface TaskRowProps {
    ordinal: number;
    name: string;
    description: string;
    specimen: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }
  ```
  Renders a fragment: a `<button type="button" className="task-row" disabled={disabled} aria-disabled={disabled} aria-describedby={descriptionId}>` containing `<span className="task-row__ordinal serif" aria-hidden="true">` (two-digit ordinal), `<span className="task-row__title serif">{name}</span>`, `<span className="task-row__specimen" aria-hidden="true">{specimen}</span>`, and either `<span className="task-row__badge">{t("common:status.comingSoon")}</span>` when disabled or `<span className="task-row__go" aria-hidden="true">→</span>`; followed by a sibling `<span id={descriptionId} className="visually-hidden">{description}</span>` (`useId`). The description sits outside the button so the button's accessible name stays the task name.
- New `src/features/home/specimens.ts`:

  ```ts
  export const SPECIMENS = {
    match: { video: "S01E03.mkv", subtitle: "[Sub] 03.ass" },
    convert: { from: ".srt", to: [".ass", ".vtt", ".sub"] },
    sync: { before: "00:01:12,400", after: "00:01:13,150" },
  } as const;

  /** Every literal a specimen renders; feeds the hard-coded-string allowlist. */
  export const SPECIMEN_TEXTS: readonly string[] = [
    SPECIMENS.match.video, SPECIMENS.match.subtitle,
    SPECIMENS.convert.from, ...SPECIMENS.convert.to,
    SPECIMENS.sync.before, SPECIMENS.sync.after,
  ];
  ```
- New `src/features/home/TaskSpecimen.tsx`: `TaskSpecimen({ task }: { task: "match" | "convert" | "sync" | "translate" })`. match: two mono chips joined by `⟷`; convert: one chip, `→`, three chips; sync: two mono timecodes joined by `→`; translate: `t("home:specimens.translate.source")`, `→`, `t("home:specimens.translate.target")`. The translate lines are locale keys (identical value in both locales: `"Long time no see."` / `"好久不見。"`) because they are prose and must pass the font-coverage and hard-coded-string gates; file names, extensions, and timecodes are constants.
- `HomeScreen.tsx`: `<h1 className="home__heading">`, then `<ol className="home__tasks">` with one `<li className="home__task">` per task holding a `TaskRow`. The subheading paragraph and `home.subheading` (both locales) are deleted. `home.tasks.*.description` keys stay (they are the accessible descriptions).
- `HomeScreen.css` / `TaskRow.css`: list `border-top: 1px solid var(--hair)`; row is a full-width grid (`grid-template-columns: 2.75rem 9rem 1fr 1.25rem`), `border-bottom: 1px solid var(--hair)`, hover `background: var(--paper-2)`; ordinal `color: var(--accent-ink)`; specimen `font-family: var(--font-mono); color: var(--ink-2)`, chips `border: 1px solid var(--hair); border-radius: var(--radius-control)`. No media query: the minimum window width is 860 px.
- `hardCodedStrings.test.tsx`: import `SPECIMEN_TEXTS` and append one exact-match pattern per entry to `ALLOWED` (escape regex metacharacters), with a comment that these are sample file names and timecodes, not prose.

### D9: Preview harness for human review (`scripts/preview/`)

`npm run dev` serves the repository root, so a second HTML entry outside `src/` is reachable in dev and never bundled (`vite build` only builds `index.html`). `scripts/` is type-checked by `tsc` but is outside the coverage `include` and the string/colour scans.

- `scripts/preview/index.html`: a `#root` div and `<script type="module" src="./main.tsx">`.
- `scripts/preview/main.tsx`: reads `?view=`, `?theme=light|dark`, `?lang=en|zh-TW`; writes `theme` to `localStorage["subx.theme"]` before mounting; calls `initI18n(lang)`; imports `../../src/styles/global.css`; renders `VIEWS[view]` inside `ThemeProvider` and a `div.app > main.app__main` wrapper; with no `view`, renders a list of links to every view.
- `scripts/preview/views.tsx`: `export const VIEWS: Record<string, () => JSX.Element>`. This change registers `app` (the real `App`) and one view per step component, reusing the fixture props of the `SCREENS` array in `src/i18n/hardCodedStrings.test.tsx`. Later changes add views here.

URL shape: `http://localhost:1420/scripts/preview/index.html?view=<name>&theme=<light|dark>&lang=<en|zh-TW>`.

### D10: `theme-system` Purpose line

When the delta is synced, `openspec/specs/theme-system/spec.md`'s `## Purpose` paragraph is replaced with exactly:

> The application's visual identity and theming behaviour: a dark and a light theme sharing one editorial paper-and-ink identity with a marker-only vermilion accent and a bundled serif, expressed entirely as CSS custom properties, following the operating system preference by default and overridable by the user.

### D11: Human review document

`openspec/changes/editorial-visual-foundation/visual-review.md` is the named review document for everything a test cannot judge (fidelity to the mockup, typographic polish, both themes). The worker fills in its evidence table; the owner signs it off. It is not a gate that a test enforces.

## Risks / Trade-offs

- [The sweep touches every stylesheet at once] → D2 is a closed mapping; `tokens.reference.test.ts` and `flatness.test.ts` fail on any leftover, and the grep in D2 is the sweep's exit check.
- [WOFF2 may be large for a desktop bundle] → size is measured and recorded (D4); subsetting is deliberately out of scope and is the owner's decision once the number exists.
- [A future locale string uses a character the font lacks] → `fontCoverage.test.ts` fails with the code point and the locale file.
- [`fontkit` cannot parse the asset or lacks types] → stop-and-report instruction in D4; the test is not weakened.
- [Removing scenario IDs strands `@covers` lines] → the hub requirement is removed and re-added under a new name (OpenSpec refuses a MODIFIED block that drops scenarios), so all four of its scenario IDs change, as do the renamed theme requirement's; tasks update every affected annotation and `npm run spec:trace` is the check.
- [Focus ring uses `--accent`] → the design document lists no focus token; accent is its "selection/marker" colour and passes 3:1 on paper in both themes. Recorded as an interpretation for the owner.

## Open Questions

- Whether to subset the font after the WOFF2 size is known. Deferrable: it changes neither the specs nor the tasks here.
