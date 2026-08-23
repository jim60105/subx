## ADDED Requirements

### Requirement: Path inputs to the checker are resolved and validated

The spec coverage checker SHALL verify that the `--config` file is an existing regular file before reading it, and SHALL reject a `--config` argument without a value. For each configured test root and the configured spec directory, the checker SHALL resolve and canonicalize the path against the repository root (the directory containing the config file's parent), and SHALL reject with an explicit error naming the offending path any input — including symlinks — that resolves outside the repository root. Containment SHALL be enforced lexically for every resolved path, whether or not it exists, and a second, symlink-safe check SHALL apply to canonicalized existing paths.

#### Scenario: A non-file or missing config path is rejected

- **WHEN** the `--config` argument resolves to a directory or a path that does not exist
- **THEN** the checker exits non-zero and names the offending path, without attempting to read it

#### Scenario: A valid config path is accepted

- **WHEN** the `--config` argument resolves to an existing regular file
- **THEN** the checker loads that config and continues exactly as before

#### Scenario: A test root that escapes the repository root is rejected

- **WHEN** a configured test root resolves to a location outside the repository root
- **THEN** the checker exits non-zero and names the offending test root

#### Scenario: A test root inside the repository root is accepted

- **WHEN** a configured test root resolves to a location inside the repository root
- **THEN** the checker walks it as before

#### Scenario: A symlinked test root pointing outside the repository root is rejected

- **WHEN** a configured test root is a symlink inside the repository root that points to a directory outside it
- **THEN** the checker exits non-zero after canonicalizing the path and names the offending test root

#### Scenario: A spec directory that escapes the repository root is rejected

- **WHEN** the configured spec directory resolves to a location outside the repository root, whether or not it exists
- **THEN** the checker exits non-zero and names the offending spec directory

#### Scenario: A symlinked test file inside a test root that points outside the repository root is rejected

- **WHEN** a test root inside the repository root contains a symlinked test file whose target lies outside the repository root
- **THEN** the checker exits non-zero after canonicalizing the file and names the offending file

#### Scenario: A symlinked spec file that points outside the repository root is rejected

- **WHEN** a `spec.md` inside the spec directory is a symlink whose target lies outside the repository root
- **THEN** the checker exits non-zero after canonicalizing the file and names the offending file

#### Scenario: A symlinked config file derives the repository root from the link's location

- **WHEN** the `--config` file is a symlink whose target lives in a different directory
- **THEN** the repository root is derived from the symlink's location (its parent directory), so the check stays anchored to the invoking repository
