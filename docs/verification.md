# Verification gates

This project keeps three promises mechanically: that the code stays covered by
tests, that every specification scenario is verified by one, and that the
TypeScript view of the IPC boundary is generated from the Rust rather than
transcribed. All three are enforced locally by `npm run verify` and again in CI
on every push.

Because there is **no pull-request flow**, CI reports *after* a commit is already
on the branch. `npm run verify` is therefore the real defence — run it before you
push — and CI is the backstop. Everything CI runs, `verify` runs too, from the
same checked-in configuration.

## Running the gates

```bash
npm run verify            # everything below, in order
```

Individually:

| Command | Gate |
| --- | --- |
| `tsc --noEmit` | TypeScript type-checks |
| `npm run test:coverage` | Frontend tests, ≥ 85 % on every Vitest metric |
| `npm run test:rust:coverage` | Backend tests, ≥ 85 % lines / regions / functions |
| `npm run spec:trace` | Every spec scenario traces to a test or a waiver |
| `npm run bindings:check` | The committed IPC bindings match the Rust definitions |

The frontend floor is declared in `vite.config.ts` (`test.coverage.thresholds`).
The backend floor is the `cov` alias in `src-tauri/.cargo/config.toml`; run it
from `src-tauri/` (`cargo cov`) so cargo picks the alias up. Stable `llvm-cov`
reports no branch data, so the backend gates three metrics rather than four.

## IPC bindings: generated, committed, gated

`src/types/bindings.ts` is generated from `src-tauri/src/bindings.rs` — a single
`tauri_specta::Builder` that also supplies the app's invoke handler, so the
registered commands and the frontend's view of them cannot come from two
different lists. **Never edit the generated file.** Change the Rust, then:

```bash
npm run bindings:generate   # rewrites src/types/bindings.ts
```

`npm run bindings:check` regenerates and then diffs against the index, so a
forgotten regeneration fails the gate. It also asserts the file is tracked —
`git diff` says nothing about an untracked file, and a gate that passes when its
subject is missing is not a gate.

Two consequences for any new DTO, both enforced by the generator refusing to
export otherwise:

- **No 64-bit integers cross the boundary.** JavaScript numbers are f64 and
  exact only to 2^53, so specta rejects `u64`/`i64`. Use `u32`, or a string when
  the value is genuinely large.
- **`#[serde(skip_serializing_if)]` is unavailable.** It cannot be expressed in
  the unified serde mode the bindings use, so an absent value travels as an
  explicit `null` and is declared `T | null`.

Commands reject rather than resolving a tagged result, which keeps the frontend's
existing `catch` path. TypeScript types no `catch` binding, so `isErrorDto` in
`src/types/ipc.ts` is the one runtime narrowing — defined against the *generated*
`ErrorDto`, so a change to the Rust error shape breaks it at compile time.

## Traceability: the `@covers` annotation

Every `#### Scenario:` in `openspec/specs/**/spec.md` must be verified by a test
that names it:

```ts
// @covers theme-system/manual-theme-override-is-persisted#override-survives-restart
it("restores the stored preference on mount", () => { … });
```

```rust
// @covers settings-management/api-key-is-masked-and-write-only#masked-display
#[test]
fn read_masks_the_api_key() { … }
```

Both languages use a `//` line comment directly above the test. The scenario ID
is derived from the spec headings:

```
<capability>/<requirement-slug>#<scenario-slug>
```

where each slug is the heading text lowercased with every run of
non-alphanumeric characters collapsed to a single `-`. You do not have to build
these by hand — the report prints them:

```bash
npm run spec:trace -- --report
```

The checker fails on an unverified scenario, on an annotation whose ID matches no
scenario (which is what a reworded heading produces), and on a stale or
unjustified waiver. An annotation asserts a human's judgement that the test
verifies the scenario; the checker only confirms the link exists and points
somewhere real — the adequacy of the assertion is a code-review matter.

## Waivers

A scenario automation genuinely cannot reach is exempted in
`scripts/spec-coverage.config.json`, and only with a written reason and a manual
procedure:

```json
{
  "id": "app-shell/application-launches-successfully-under-wayland#launch-on-nvidia-wayland",
  "reason": "Needs a real Wayland compositor and an NVIDIA GPU; GitHub-hosted runners have neither.",
  "manualVerification": "docs/verification.md#manual-wayland-smoke-test"
}
```

A waiver is rejected if it omits either field, names a scenario that no longer
exists, or names one that a test in fact annotates. Two scenarios are
waived today.

### Manual Wayland smoke test

The first waived scenario — the app launching on NVIDIA + Wayland without a
WebKitGTK DMABUF crash — is verified by hand:

1. On a Linux machine with an NVIDIA GPU running a Wayland session
   (`echo $XDG_SESSION_TYPE` → `wayland`).
2. Build and run the app: `npm run tauri dev`.
3. The window must open and render. A failure looks like an immediate crash with
   `Error 71 dispatching to Wayland display`.

The pure part of the workaround — which environment overrides each target needs
— is unit-tested in `src-tauri/src/platform.rs`; only the window actually
opening cannot be asserted headless.

### Manual release installation verification

The second waived scenario (`release-pipeline/every-supported-desktop-target-is-built-from-a-pinned-environment#the-published-bundle-installs-and-launches-on-each-platform`)
covers cross-platform package installation and launch verification:

1. **Per-platform installation and launch check**:
   - **Linux**: Install the `.deb` package (`sudo dpkg -i subx_*.deb`) or run the `.AppImage` (`chmod +x SubX_*.AppImage && ./SubX_*.AppImage`). Launch SubX and verify that the version reported matches the release tag.
   - **macOS**: Open `.dmg` and drag `SubX.app` to `/Applications`. If macOS Gatekeeper blocks launch ("SubX is damaged and can't be opened"), clear the quarantine attribute:
     ```bash
     xattr -dr com.apple.quarantine /Applications/SubX.app
     ```
     Launch SubX and verify that the version reported matches the release tag.
   - **Windows**: Run the `.msi` or `.exe` installer. If Windows SmartScreen displays a warning ("Windows protected your PC"), click **More info** → **Run anyway**. Launch SubX and verify that the version reported matches the release tag.
2. **Windows installer license display check**:
   - During Windows installation, visually confirm that the license step displays the GPL license text cleanly without markdown formatting glitches or truncation.
3. **Maintainer publish checklist**:
   - Wait for `ci.yml` to complete with a green pass on the release tag commit SHA.
   - Confirm all five target build outputs (macOS arm64, macOS x86_64, Linux x86_64, Linux arm64, Windows x86_64) are attached to the draft release.
   - Perform installation and launch verification on available test machines.
   - Publish the draft release on GitHub.
4. **Post-publish flaw handling**:
   - If a critical bug or packaging flaw is identified after publishing, **do not** silently replace published assets under the existing tag.
   - Edit the release notes to document the issue or yank/delete the release assets and publish a patch release (e.g. `v0.1.1`).

## Adding a feature

A new change proposal carries the annotation obligation forward automatically
(see the `tasks` rule in `openspec/config.yaml`). Concretely, when you land a
feature:

- Annotate every new scenario, or waive it with justification.
- New modules count against the same 85 % floor — do not widen an exclusion list
  to dodge it; that is how a gate becomes decorative.
- Extend the cross-cutting tests that enumerate screens: the hard-coded-string
  test (`src/i18n/hardCodedStrings.test.tsx`) lists every screen it renders, and
  a new screen must be added to it.
- A new command goes in `bindings.rs`'s single `collect_commands![…]` and in
  `ipc_tests.rs`'s `COMMANDS` allowlist — the mock runtime starts with an empty
  ACL and denies anything unlisted. Then regenerate the bindings and commit them
  with the change.
