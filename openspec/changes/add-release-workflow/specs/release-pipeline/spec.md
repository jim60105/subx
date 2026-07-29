# release-pipeline Delta

## ADDED Requirements

### Requirement: Releases are cut from version tags and from nothing else

The repository SHALL define a release workflow that runs when a tag matching `v*` is pushed, and SHALL NOT begin a release on any branch push. The same workflow SHALL additionally offer a manually dispatched mode that builds every supported target and publishes nothing, so the build matrix can be exercised without spending a version number on it.

#### Scenario: A version tag starts the release

- **WHEN** a tag whose name begins with `v` is pushed
- **THEN** the release workflow runs and assembles a release for that tag

#### Scenario: A branch push does not start a release

- **WHEN** a commit is pushed to any branch without a tag
- **THEN** the release workflow does not run, and no release, draft or tag is created by it

#### Scenario: A manual dispatch builds every target and publishes nothing

- **WHEN** the workflow is started manually rather than by a tag
- **THEN** it builds every supported target and retains the bundles as workflow artifacts, and it creates no release and uploads nothing to one

### Requirement: The released version is declared once

The version being released SHALL have exactly one authoritative declaration, in `package.json`. The Tauri bundle configuration SHALL read that declaration rather than restating it. Every other place the version necessarily appears — the Rust crate manifest, which supplies the `app_version` the application reports over IPC, and the lock file — SHALL be held to the same value by an automated check that runs in the ordinary test suite. The release workflow SHALL verify that the tag being released names that same version, and SHALL fail before building anything if it does not.

#### Scenario: Disagreeing version declarations fail the test suite

- **WHEN** the version in the Rust crate manifest or the lock file differs from the version in `package.json`
- **THEN** the test suite exits non-zero and names both values, so the drift cannot be committed

#### Scenario: The bundle version comes from the authoritative declaration

- **WHEN** the Tauri bundle configuration is inspected
- **THEN** its version field points at `package.json` rather than carrying a literal version of its own

#### Scenario: A tag that disagrees with the declared version aborts the release

- **WHEN** the workflow runs for a tag whose name is not `v` followed by the version declared in `package.json`
- **THEN** the workflow fails in its first job, before any platform build starts, and reports both the tag and the declared version

### Requirement: Every supported desktop target is built, from a pinned environment

The workflow SHALL build SubX for macOS on arm64 and x86_64, Linux on x86_64 and arm64, and Windows on x86_64. Each build environment SHALL be named by an explicit, pinned runner image rather than a floating `-latest` label, because the build machine's system libraries determine the compatibility floor of the artifact it produces. A failure on one target SHALL NOT abandon the remaining targets.

#### Scenario: The matrix covers every supported target

- **WHEN** the release workflow is inspected
- **THEN** it declares build jobs for macOS arm64, macOS x86_64, Linux x86_64, Linux arm64, and Windows x86_64

#### Scenario: Build environments are pinned, not floating

- **WHEN** the release workflow's runner labels are inspected
- **THEN** every one names an explicit image version, and none uses a `-latest` label

#### Scenario: One target's failure does not abandon the others

- **WHEN** a build fails on one platform
- **THEN** the remaining platforms still build and still upload their bundles, so a single broken target is diagnosable without re-running the whole matrix

#### Scenario: The published bundle installs and launches on each platform

- **WHEN** a maintainer installs the produced package on each supported operating system
- **THEN** the installer completes, the application launches, and the version it reports matches the released tag

### Requirement: A release is assembled privately and published by a person

The workflow SHALL create the release as a draft in a single preparation job that runs before any platform build, and every build job SHALL upload its bundles into that already-created release rather than creating one of its own. The release SHALL remain a draft when the workflow finishes: making it public SHALL be a deliberate human act, taken after the verification pipeline has reported on the same commit. Re-running the workflow for a tag that already has a release SHALL reuse that release rather than create a second one.

#### Scenario: The draft is created once, before any build

- **WHEN** the workflow runs for a version tag
- **THEN** a single preparation job creates the release as a draft and emits its identifier, and the platform builds do not start until it has

#### Scenario: Build jobs upload into the prepared release

- **WHEN** a platform build finishes
- **THEN** it uploads its bundles to the release identified by the preparation job, rather than creating or looking up a release itself

#### Scenario: The workflow never publishes

- **WHEN** the workflow completes successfully for a version tag
- **THEN** the release is still a draft, and no step in the workflow publishes it

#### Scenario: A re-run reuses the existing release

- **WHEN** the workflow runs again for a tag that already has a release
- **THEN** the preparation job reuses that release and its assets are replaced in place, so no duplicate release is created

### Requirement: Release notes are written by a maintainer, not generated from commits

The release body SHALL be the changelog section for the version being released, taken from a checked-in `CHANGELOG.md`. A version with no changelog section SHALL abort the release in the preparation job, before any platform build. The workflow SHALL NOT substitute automatically generated commit or pull-request summaries for the written notes.

#### Scenario: The notes are the changelog section for the version

- **WHEN** the preparation job renders the notes for a version that has a changelog section
- **THEN** the release body contains that section's entries and no other version's

#### Scenario: A version with no changelog section aborts the release

- **WHEN** the preparation job renders the notes for a version that has no section in `CHANGELOG.md`
- **THEN** it exits non-zero, naming the missing version, and no platform build runs

### Requirement: Every published file carries verifiable build provenance

Each build job SHALL attach a build-provenance attestation to every bundle it publishes, so a downloaded file can be traced to this repository, this workflow and this commit. Only regular files SHALL be submitted as attestation subjects. The workflow SHALL grant no permission beyond what each job needs: no write permission at the workflow level, and the provenance permissions only on the jobs that produce artifacts.

#### Scenario: Each build job attests the files it produced

- **WHEN** a platform build produces bundles
- **THEN** it generates a build-provenance attestation covering those files, which `gh attestation verify` accepts for the downloaded artifact

#### Scenario: Only regular files are submitted as subjects

- **WHEN** the produced artifact list includes a directory, such as the macOS `.app` bundle
- **THEN** it is excluded from the attestation subjects, and the remaining files are still attested

#### Scenario: Permissions are granted per job, not workflow-wide

- **WHEN** the release workflow's permissions are inspected
- **THEN** the workflow-level grant is empty, and each job declares only the permissions it needs

### Requirement: Distribution is unsigned, and every release says so

SubX SHALL be distributed without Apple or Windows code-signing identities, and the release workflow SHALL therefore require no secret beyond the automatically provided GitHub token. Because that choice is visible to users as operating-system warnings, every release body SHALL carry the resulting installation caveats: the Linux system-library floor, the macOS quarantine removal step, the Windows SmartScreen path, and the provenance verification command that stands in for a signature. No update endpoint SHALL be published, so that adopting in-app updates remains an explicit future decision rather than an accident of the release format.

#### Scenario: The workflow needs no signing secrets

- **WHEN** the release workflow is inspected
- **THEN** it references no repository secret other than the automatic GitHub token, and declares no code-signing or notarization credentials

#### Scenario: The release body carries the installation caveats

- **WHEN** a release is prepared
- **THEN** its body ends with the shared caveats text covering the Linux system-library floor, the macOS quarantine step, the Windows SmartScreen path, and the provenance verification command

#### Scenario: No update endpoint is published

- **WHEN** the workflow uploads a release's assets
- **THEN** it publishes no updater manifest, so no application build can discover an update feed from a release

### Requirement: Published packages identify themselves

The bundle configuration SHALL declare the identifying metadata that the Linux and Windows package formats present to users and to package managers — publisher, homepage, category, copyright, and both a short and a long description — rather than relying on bundler defaults. It SHALL also point at the project's license text, so the Windows installers can display it.

#### Scenario: The bundle declares complete identity metadata

- **WHEN** the bundle configuration is inspected
- **THEN** it declares a publisher, a homepage, a category, a copyright line, a short description and a long description, each non-empty

#### Scenario: The installers can present the license

- **WHEN** the bundle configuration is inspected
- **THEN** it names a license file that exists in the repository
