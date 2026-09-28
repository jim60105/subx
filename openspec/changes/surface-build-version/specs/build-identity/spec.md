# build-identity Delta

## ADDED Requirements

### Requirement: Build identity embedded at compile time

The application SHALL know its build identity — the package version and, when git metadata was available at build time, the short commit hash and the build profile — without any network access or runtime git invocation. When git metadata is unavailable (source archive, missing git tooling), the build SHALL succeed and the identity SHALL fall back to the package version alone.

#### Scenario: Git-backed build embeds the hash

- **WHEN** the application is built from a checkout that contains git metadata
- **THEN** the compiled binary carries that commit's short hash alongside the package version, with no runtime git lookup

#### Scenario: Git-less build degrades to version only

- **WHEN** the application is built where git metadata cannot be read
- **THEN** the build completes successfully and the identity is the package version alone, with no error surfaced to the user

### Requirement: Startup log line names the running build

The backend SHALL print exactly one startup line identifying the running build (application name, version, short hash when present, and build profile in debug builds) to standard output before the main window is constructed, so a developer inspecting process output can tell which binary is running.

#### Scenario: Launch logs the build identity

- **WHEN** the backend process starts
- **THEN** standard output shows one line containing the application name and version, plus the short hash when the build embedded one

#### Scenario: Stale-instance diagnosis

- **WHEN** two app instances from different commits are running and a developer inspects each process's output
- **THEN** each instance's startup line carries that instance's own commit hash, distinguishing them

### Requirement: Version badge reports the running build persistently

The frontend SHALL display, on every screen, a badge with the backend's running-build identity (version, and short hash when present), obtained through the typed command interface rather than from any frontend-side build metadata. The badge SHALL render nothing until the identity has been reported, SHALL present the identity verbatim outside the localization system, and SHALL carry a localized accessible name.

#### Scenario: Badge visible on every screen

- **WHEN** the user is on the home hub, any wizard, or Settings
- **THEN** the header shows the version badge with the running build's version (and short hash when the build embedded one)

#### Scenario: No hash, no suffix

- **WHEN** the running backend reports no commit hash
- **THEN** the badge shows the version alone with no dangling separator or placeholder

#### Scenario: Identity reported, never invented

- **WHEN** the version has not yet been received from the backend
- **THEN** the badge is absent rather than showing a hard-coded or frontend-derived value

#### Scenario: Absent badge signals a stale bundle

- **WHEN** the running frontend bundle predates the build-identity feature and therefore never queries the backend
- **THEN** no badge is shown and no frontend-side fallback string is rendered, so a missing badge itself identifies the stale instance

#### Scenario: Badge survives the narrowest window

- **WHEN** the window is resized to its minimum supported width
- **THEN** the badge text remains fully visible and unclipped, with the brand tagline being the element that truncates first

#### Scenario: Badge copyable for bug reports

- **WHEN** the user selects the badge text
- **THEN** the version and hash are selectable as plain text

### Requirement: Build identity crosses the typed IPC boundary as one DTO

The backend SHALL expose the build identity as a queryable command returning the raw parts — version string, optional short hash, debug flag — registered in the command allowlist and surfaced through the generated TypeScript bindings like every other command.

#### Scenario: Command round-trip

- **WHEN** the frontend invokes the build-info command over IPC
- **THEN** it receives the version, the optional hash, and the debug flag matching the compiled-in identity

#### Scenario: Allowlist stays complete

- **WHEN** the backend command surface is enumerated
- **THEN** the build-info command appears in the IPC test allowlist alongside all existing commands
