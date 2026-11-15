# build-identity Delta

## MODIFIED Requirements

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

- **WHEN** the window is resized to its minimum supported width of 860 pixels
- **THEN** the badge text remains fully visible and unclipped, with the breadcrumb's current-screen title being the element that truncates first

#### Scenario: Badge copyable for bug reports

- **WHEN** the user selects the badge text
- **THEN** the version and hash are selectable as plain text
