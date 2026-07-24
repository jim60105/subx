# Design: add-verification-gates

## Context

The repository holds two independently tested halves — a Vitest/jsdom frontend (72 tests) and a `cargo test` backend (15 tests) — and four capability specifications carrying 17 requirements and 27 scenarios. Nothing connects them. A measurement taken while writing this proposal (with `@vitest/coverage-v8` and `cargo-llvm-cov` installed temporarily) gives the current baseline:

| Scope | Statements/Lines | Branches | Functions | Notable holes |
| --- | --- | --- | --- | --- |
| Frontend (`src/**`) | 95.71 % | 90.54 % | 98.52 % | `main.tsx` 0 %, `navigation/screens.ts` 0 % (type-only) |
| Backend (`src-tauri/src/**`) | 88.77 % lines, 91.37 % regions | not reported | 80.85 % | `state.rs` 0 %, `lib.rs` 0 % |

So the 85 % floor is *nearly* met today — which is precisely why it should be nailed down now, before `add-match-wizard` roughly doubles both codebases. The harder half of the ask is the second one: "all requirements covered" is not a number, it is a mapping, and no mapping exists.

Constraints shaping this design:

- **Two languages, one contract.** Whatever links tests to scenarios must work identically for `.tsx` and `.rs`, without a shared test runner.
- **The spec text is the source of truth and it moves.** Requirement headings get reworded. The mechanism must fail loudly on drift rather than silently decay.
- **No display, no GPU in CI.** Some scenarios are about a real window opening on a real compositor.
- **Keep the toolchain small.** The repo has no linter, no formatter config and no CI today; this change should add the minimum that makes the gates real.

## Goals / Non-Goals

**Goals:**

- A coverage floor of 85 % enforced from checked-in configuration, in both languages, that fails a local run and a CI run identically.
- A mechanical, drift-detecting mapping from every specification scenario to the tests that verify it.
- A written, reviewable escape hatch for the scenarios automation genuinely cannot reach — with the expectation that it holds exactly one entry.
- Close the coverage and verification gaps the audit exposed, including the two WCAG violations the new contrast test surfaces.
- CI that runs all of the above on every push (this project has no pull-request flow — see D8).

**Non-Goals:**

- **Linting and formatting gates** (`clippy -D warnings`, `cargo fmt --check`, ESLint, Prettier). Worth having, unrelated to this ask, and each would need its own configuration debate.
- **Mutation testing.** `.gitignore` already anticipates `cargo mutants`; a coverage floor is the prerequisite, not a competitor. Later change.
- **End-to-end / WebDriver tests.** `tauri-driver` on a virtual display would automate the Wayland scenario, at a cost far beyond this change. It stays waived.
- **Raising the floor above 85 %.** The frontend is already at 95.7 %; ratcheting is a separate decision, and a floor set at today's actual number would make every honest refactor a CI failure.
- **Changing any product requirement.** Only the two contrast token values change behaviour, and they change it *towards* what `theme-system` already requires.

## Decisions

### D1 — Traceability by inline `@covers` annotation, not a central mapping file

Scenario IDs are derived from the spec's own headings:

```
<capability>/<requirement-slug>#<scenario-slug>
```

`capability` is the spec's directory name; the two slugs come from the heading text after `### Requirement:` / `#### Scenario:`, lowercased, with every run of non-alphanumeric characters collapsed to a single `-` and the ends trimmed. Real examples:

```
app-shell/thin-tauri-command-layer-structure#crate-access-is-confined-to-the-command-layer
theme-system/theme-follows-system-preference-by-default#first-launch-on-a-dark-mode-system
app-shell/application-launches-successfully-under-wayland#launch-on-nvidia-wayland
```

A test declares what it verifies with a line comment directly above it:

```ts
// @covers theme-system/manual-theme-override-is-persisted#override-survives-restart
it("restores the stored preference on mount", () => { … });
```

```rust
// @covers settings-management/api-key-is-masked-and-write-only#masked-display
#[test]
fn read_masks_the_api_key() { … }
```

Both languages use `//`, so a single line-oriented scanner handles both — no parser, no per-language plugin.

*Alternatives considered.* **A central `traceability.yaml`** mapping scenario IDs to test names was the main contender: one file to review, no scanner subtleties. Rejected because it drifts — a test can be deleted or gutted while its row survives, and the row is far from the test that reviewers actually read. **Encoding the ID in the test name** (`it("spec:theme-system/… — restores the stored preference")`) keeps the link even closer, but makes test names unreadable and breaks the moment a scenario is verified by an assertion inside a differently-named test.

*Accepted cost.* An `@covers` annotation asserts a human's judgement that the test verifies the scenario; the checker verifies the link exists and points somewhere real, not that the assertions are adequate. That is a code-review responsibility, and it is the same responsibility a mapping file would carry — inline just puts it where the reviewer is already looking.

### D2 — Drift fails the build in both directions

The checker reports two distinct failures, and both are errors:

- a scenario with no annotation and no waiver → **unverified**;
- an annotation (or waiver entry) whose ID matches no scenario in the specs → **dangling**.

Rewording a requirement heading therefore produces one of each, naming both sides, which is exactly the information needed to fix it. This is intentional friction: heading text is part of the contract, and a silent rename that orphans its tests is the failure mode this whole change exists to prevent.

### D3 — The checker is a dependency-free Node ESM script

`scripts/check-spec-coverage.mjs`, run as `npm run spec:trace`. It uses only `node:fs`/`node:path` — a recursive directory walk rather than a glob dependency, so it works on any Node the project already supports. It exports its parsing functions and guards the CLI entry point (`if (process.argv[1] === fileURLToPath(import.meta.url))`), which lets `scripts/check-spec-coverage.test.ts` unit-test it under Vitest against fixture spec trees in `os.tmpdir()`.

Two robustness rules the parser must hold to. **Slug collisions are fatal:** two scenario headings under one requirement that slugify to the same ID would let a single annotation silently satisfy both, destroying the 1:1 guarantee, so the checker fails on a duplicate derived ID rather than deduplicating. (No collision exists in the 27 current scenarios, but nothing prevents one.) **A missing test root is not an error:** `src-tauri/tests/` does not exist yet, and the walker must skip absent roots instead of throwing.

Configuration and waivers live together in `scripts/spec-coverage.config.json`:

```jsonc
{
  "specDir": "openspec/specs",
  "testRoots": ["src", "scripts", "src-tauri/src", "src-tauri/tests"],
  "testExtensions": [".ts", ".tsx", ".rs", ".mjs"],
  "waivers": [
    {
      "id": "app-shell/application-launches-successfully-under-wayland#launch-on-nvidia-wayland",
      "reason": "Needs a real Wayland compositor and an NVIDIA GPU; GitHub-hosted runners have neither.",
      "manualVerification": "docs/verification.md#manual-wayland-smoke-test"
    }
  ]
}
```

A waiver missing `reason` or `manualVerification` is rejected, as is a waiver for a scenario that is also annotated (stale) or that no longer exists (dangling).

*Note on scope.* The checker reads `openspec/specs/` — the accepted specifications — not `openspec/changes/*/specs/`. A change's delta spec becomes binding when it is synced or archived, which is exactly when its scenarios must have tests. This is why `add-match-wizard`'s `match-workflow` scenarios are not this change's problem, and why they will be that change's problem the moment it lands.

*Consequence for this change.* Its own `verification-gates` scenarios are invisible to the checker until they reach `openspec/specs/`, so annotating them early would produce dangling IDs. Task 5.1 therefore syncs this change's delta into the accepted specs once the tests exist, using OpenSpec's own sync-specs workflow, and the gate immediately applies to itself. The cost is that `openspec/specs/` briefly describes a capability whose change is not yet archived; if the change were reworked the sync would have to be reverted. For a single-maintainer, zero-user repository that is a cheap trade for the alternative — a gate that cannot check itself until after it has already shipped. The archive step later re-syncs the same content and is a no-op.

*Alternative considered.* Teaching the checker to also read the in-flight change's own delta specs avoids touching `openspec/specs/`. Rejected because "the in-flight change" is not a concept the checker can determine reliably — `add-match-wizard`'s delta spec sits in the same directory and would be pulled in too, failing the gate on scenarios nobody has implemented yet.

### D4 — Scenarios about *configuration* are verified by asserting the configuration

Three requirements describe the gates themselves: the coverage thresholds, and CI running them. Testing "a run below 85 % exits non-zero" properly would mean spawning a second Vitest against a deliberately under-covered fixture, and the backend equivalent would mean a second `cargo llvm-cov` build — minutes of CI for a behaviour that belongs to Vitest and `cargo-llvm-cov`, both of which test it themselves.

So those scenarios are verified by tests that assert the mechanism is *armed*: that `vite.config.ts` declares `coverage.thresholds` with every metric at ≥ 85 and `coverage.all` enabled; that `src-tauri/.cargo/config.toml`'s alias carries `--fail-under-lines 85` and the other `--fail-under-*` flags; that `.github/workflows/ci.yml` invokes all three gate commands on `push` and contains no `continue-on-error` or `|| true` on a gate step.

This is stated plainly because it is the weakest link in the design: an armed gate that never fires is indistinguishable from a broken one until coverage actually dips. The compensating control is that CI runs the real gates on every commit, so a misconfiguration surfaces on the first change that would have tripped it — and the thresholds sit close enough to today's numbers (88.77 % backend lines) that "never fires" is not a realistic worry.

*Alternative considered.* Committing a small fixture package with deliberately low coverage and running the gate against it in CI would test the real behaviour. Rejected as disproportionate: it doubles the CI matrix to test third-party tools.

### D5 — Coverage scope: measure everything first-party, exclude by name

Vitest coverage is configured with `all: true` and `include: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"]`, so a new module that no test imports drags the number down instead of vanishing. The exclusion list is short, individually justified, and contains no wildcard over measurable source:

| Excluded | Reason |
| --- | --- |
| `src/main.tsx` | Process entry point: mounts the React root; running it *is* starting the app |
| `src/navigation/screens.ts` | Type-only module — compiles to nothing, so v8 reports it as 0 % of 0 |
| `src/**/*.test.{ts,tsx}`, `src/test/**`, `scripts/**/*.test.ts` | Tests and test helpers are not first-party source |
| `src/vite-env.d.ts` | Ambient declarations |

**`coverage.include` is not `test.include`.** The existing `test.include` is `["src/**/*.{test,spec}.{ts,tsx}"]` — scoped to `src/` only. Measuring `scripts/**/*.mjs` without also extending `test.include` to `scripts/**/*.test.ts` would leave the checker's own test file undiscovered *and* count the checker as entirely uncovered: the traceability tool would drag down the very gate it exists to complement, and task 5.2's annotations would point at a file Vitest never runs. Both keys are therefore updated together. The `scripts` tests run under the same jsdom environment as the rest for simplicity; splitting into a Vitest project with a `node` environment is a refinement, not a requirement.

The Rust side gets the same treatment through a cargo alias in `src-tauri/.cargo/config.toml`, so the flags cannot drift between a local run and CI:

```toml
[alias]
cov = ["llvm-cov", "--lib", "--fail-under-lines", "85", "--fail-under-functions", "85",
       "--fail-under-regions", "85",
       "--ignore-filename-regex", "(^|/)(main|lib)\\.rs$|/rustlib/"]
```

`main.rs` is the process entry point and `lib.rs` is the Tauri builder wiring, neither of which can run headless; `/rustlib/` drops the standard-library files that `llvm-cov` otherwise leaks into the report. The one part of the old `run()` that *is* testable — the command registration — is not left in the excluded `lib.rs`: it moves to `handlers.rs` (a single `generate_handler!` in `invoke_handler()`), which stays measured and is exercised by the `tauri::test` suite, so excluding `lib.rs` never hides a registration regression. Note that stable `llvm-cov` reports no branch data — hence three `--fail-under-*` flags, not four. That asymmetry with the frontend is a tool limitation, and it is why the spec says "every metric the measuring tool reports".

### D6 — Make the untestable testable rather than waiving it

Two pieces of production code are currently unreachable from tests for structural reasons, and both are cheap to restructure:

- **`state.rs` at 0 %.** `AppState` is only ever constructed inside `lib.rs::run()`. Tests construct it directly with an `Arc<TestConfigService>` and assert `config_service()` hands back the same service — which also pins the "one service for the whole process" invariant the doc comment argues for.
- **The Wayland workaround at 0 %.** `main.rs` sets `__NV_DISABLE_EXPLICIT_SYNC=1` inline, inside the one function no test can call. It moves to `src-tauri/src/platform.rs` as a pure function returning the environment overrides for the current target, plus a thin applier that `main()` calls. The pure function is unit-testable; the scenario itself stays waived, because setting an environment variable is not the same as a window opening.

- **The `#[tauri::command]` wrappers at 0 %.** A per-function reading of the coverage data (not just the file summary) shows exactly where the backend's weak 80.85 % function metric comes from: `get_config`, `set_config_value` and `test_ai_connection` in `commands/config.rs` are never executed. Every test calls the extracted logic — `read_config`, `write_config_value`, `probe_ai_connection` — because the wrappers take `State<AppState>`, which cannot be constructed without a Tauri app. `commands/system.rs::ping` is fully covered only because it takes no state. `tauri` 2.11 ships `tauri::test` behind a `test` feature, giving `mock_builder()`, `mock_context()`, `noop_assets()` and `get_ipc_response()`; adding `tauri = { version = "2", features = ["test"] }` to `[dev-dependencies]` lets a test build a mock app, `manage()` an `AppState` over a `TestConfigService`, and invoke each command through the real IPC path — which also proves the `invoke_handler` registration and the DTO serde round-trip, neither of which any current test touches.

  This matters beyond the number. Arithmetic on the measured data says the floor is reachable without it: dropping `lib.rs` and `main.rs` from measurement and adding `state.rs` tests takes functions from 82.5 % to ~87.5 % (35 of 40), lines to ~92 % and regions to ~95 %. But 87.5 % is 2.5 points of headroom on a metric where one new uncovered function costs ~2.5 points — and `add-match-wizard` adds a whole `commands/match.rs` of exactly this shape. Testing the wrappers now converts a recurring structural gap into a pattern the next change can copy.

*Alternative considered.* Waiving both, and excluding `commands/*.rs` wrapper functions from measurement. Rejected: a 0 % file is a gap the gate should close, `state.rs` in particular is about to grow `PlanState` in `add-match-wizard`, and an exclusion that grows with every new command is how a coverage gate quietly becomes decorative.

### D7 — Verifying the "soft" requirements

Four scenarios assert properties that no conventional unit test touches. Each gets a purpose-built test:

- **"No user-facing string SHALL be hard-coded"** — render every screen through i18next's built-in `cimode`, in which every translation resolves to its own key. Any text node left in the DOM that is not a key is hard-coded prose. Filtering is needed for legitimate non-translated content (digits, punctuation, interpolated values), so the test asserts on text nodes containing letters and compares them against the key shape. This catches the failure the locale-parity test structurally cannot: a string that was never routed through i18n has no key to be missing.
- **"All text meets readable contrast"** — parse `tokens.css`, resolve each theme block, alpha-composite the translucent surfaces over `--bg-base`, and assert WCAG AA (4.5:1) for every text token against every background it is used on, in both themes. Gradient-backed text is checked against the *worst* endpoint, not an average. As recorded in the proposal, this fails today at two points, which this change fixes:
  - light `--text-muted` `#6b7192` → `#5f6585` (4.42 → 5.28);
  - white on the gradient's cyan end 2.43:1 → a new `--accent-gradient-strong` (`#7c3aed` → `#0e7490`, 5.36:1) applied to `TaskCard.css`, `WizardShell.css` and `SettingsScreen.css` where they put `--text-on-accent` on a gradient, and to `global.css`'s `.gradient-text` — the app-name wordmark, which is the gradient rendered *as* text through `background-clip: text` and whose cyan end is illegible on the light base for the same reason. The wordmark is checked at large-text AA (≥ 3:1, since it is 22px/700), not 4.5:1. `--accent-gradient` itself is unchanged and keeps carrying the neon identity on decorative surfaces.
- **"Components never hard-code a color"** — scan `src/**/*.css` for hex, `rgb(`, `hsl(` and named-colour literals outside `tokens.css`, **and** `src/**/*.tsx` for colour literals inside inline `style={{ … }}` props. The CSS half alone would be a proxy with an obvious hole: an inline style is the easiest way to hard-code a colour in React and would pass a CSS-only scan while violating the requirement. Keywords that are not colours in the relevant sense — `transparent`, `currentColor`, `inherit` — are allowed. This is what makes the contrast test meaningful: a contrast proof over tokens is only a proof if nothing bypasses the tokens.

  A textual note on the token split: `theme-system` says accent elements "use the shared gradient in both themes". Adding `--accent-gradient-strong` keeps that true in the sense the requirement means — the same violet→cyan identity, shared between light and dark, rather than one literal gradient instance. Both gradients derive from `--accent-from`; only the endpoint darkens where white text sits on it.
- **"Crate access is confined to the command layer"** — scan the frontend sources for `subx_cli` / `subx-cli` and assert none appears outside `src-tauri/`. Plus a cross-language test asserting every `core.*` and `config.*` error code the Rust source can emit exists in both `src/locales/en/errors.json` and `src/locales/zh-TW/errors.json`, which is the enforceable half of "the backend never emits translated text".

### D8 — CI shape

`.github/workflows/ci.yml`, three jobs on `push`, running in parallel:

| Job | Steps |
| --- | --- |
| `frontend` | `setup-node` (npm cache) → `npm ci` → `npx tsc --noEmit` → `npm run test:coverage` |
| `backend` | apt-install the Tauri/WebKitGTK system dependencies → `dtolnay/rust-toolchain@stable` with `llvm-tools-preview` → `Swatinem/rust-cache` → `taiki-e/install-action@cargo-llvm-cov` → `cargo cov` |
| `traceability` | `setup-node` → `node scripts/check-spec-coverage.mjs` (no install: the checker has no dependencies) |

The traceability job is deliberately separate and dependency-free so it returns in seconds — the gate contributors will trip most often should also be the fastest to tell them.

**This project does not use a pull-request flow**, so `push` is the only trigger and the gates are a post-hoc alarm rather than a merge barrier: a red commit is already on the branch by the time CI reports. That makes the local `npm run verify` script (6.5) the primary defence and CI the backstop, which is the reverse of the usual emphasis and is why `verify` must run every gate the pipeline runs, in the same way, from the same checked-in configuration.

### D9 — Carrying the convention forward

Two low-cost mechanisms keep the next change from re-litigating this:

- `docs/verification.md` — how to run each gate locally, how to write an annotation, how to find a scenario ID (`npm run spec:trace -- --report`), what makes a waiver acceptable, and the manual Wayland smoke-test procedure the one waiver points at.
- A `tasks` rule in `openspec/config.yaml`, so every future proposal generated through the OpenSpec workflow is told that each new scenario needs a `@covers` annotation or a waiver. This is what makes the gate a habit rather than a tripwire.

## Risks / Trade-offs

- **An annotation can lie — a test may be tagged without really verifying its scenario.** → The checker enforces the link's existence, not its adequacy; reviewers judge the assertion. Mitigated by keeping the annotation adjacent to the test it describes (D1) and by `--report`, which makes a scenario verified by one thin test visible next to one verified by five.
- **The first batch of annotations could be assigned by file-name association rather than by reading the assertions** — the failure mode that would make the initial matrix false from day one. The clearest candidate is *"External changes are picked up"*: `config.rs::the_config_file_is_the_shared_store` verifies reload-on-read, which is what the scenario's "after its re-fetch" wording asks for, but only re-reading the scenario against the test body settles it. → Task 4 opens with an explicit pass that reads each scenario's WHEN/THEN against the test it is about to be attached to, and adds an assertion where the test falls short instead of annotating optimistically.
- **The checker's own CLI entry line stays uncovered** if its tests only import its functions. → One test spawns `node scripts/check-spec-coverage.mjs` as a child process against a fixture tree, which covers the entry guard and exercises the real exit codes rather than just the pure functions.
- **Gate-arming tests assert configuration, not behaviour (D4).** → CI runs the real gates on every commit, so an unarmed gate is caught by the first change that should have tripped it. Stated openly rather than presented as equivalent to a behavioural test.
- **Heading rewords break annotations.** → By design (D2). The cost is a mechanical fix; the benefit is that a spec edit can never silently orphan its verification. `--report` names both halves of the break.
- **The `cimode` hard-coded-string test may produce false positives** on legitimately untranslated content (numbers, symbols, user data, interpolated values). → Assert only on text nodes containing letters, and keep a narrow, commented allowlist. If it becomes noisy it should be narrowed, never disabled.
- **The contrast fix changes what users see.** → Confined to two token values and the three stylesheets that put text on a gradient; the brand gradient itself is untouched, so the neon identity survives on every decorative surface.
- **The backend CI job is slow** — it builds `subx-cli` and the WebKitGTK stack from scratch. → `Swatinem/rust-cache` plus apt caching; the frontend and traceability jobs run in parallel and return fast, so contributors get most of their signal quickly.
- **An 85 % floor can be met with low-value tests.** → A floor is a floor, not a target; the traceability gate is the part that asks whether the *right* things are tested, which is why both ship together.
- **`llvm-cov` reports no branch coverage on stable.** → Accepted; three metrics are gated instead of four, and the spec is worded to match the tool rather than pretending otherwise.

## Migration Plan

Not applicable — nothing to migrate. The change is additive apart from the two contrast token values, and the project is unreleased with no users. Rollback is deleting the workflow file and the coverage/traceability configuration; no product code path is altered.

The one ordering constraint worth naming: annotate and close the gaps *before* wiring CI, so the pipeline is green on its first run. A CI file that lands red teaches contributors to ignore it.

## Open Questions

None blocking. Two decisions were taken deliberately and are worth revisiting later:

- Whether to ratchet the floor upward once `add-match-wizard` lands and the real post-feature numbers are known.
- Whether `tauri-driver` end-to-end tests eventually retire the single Wayland waiver.
