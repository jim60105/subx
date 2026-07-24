## ADDED Requirements

### Requirement: Enforced minimum test coverage in both languages

The TypeScript frontend and the Rust backend SHALL each measure the coverage of their own source during the test run, and the run SHALL exit non-zero when any coverage metric the measuring tool reports falls below **85 %**. The threshold SHALL be declared in checked-in configuration, not supplied ad hoc on the command line by whoever happens to run the suite.

#### Scenario: Frontend coverage below the floor fails the run

- **WHEN** the frontend test suite runs with coverage and any reported metric (statements, branches, functions, lines) is below 85 %
- **THEN** the command exits non-zero and names the metric and the measured value

#### Scenario: Backend coverage below the floor fails the run

- **WHEN** the backend coverage command runs and any reported metric (lines, regions, functions) is below 85 %
- **THEN** the command exits non-zero and names the metric and the measured value

#### Scenario: The threshold lives in the repository

- **WHEN** a contributor runs the coverage command with no extra arguments
- **THEN** the 85 % threshold is applied from checked-in configuration, so a local run and a CI run enforce the same floor

### Requirement: Coverage measurement scope is declared, and everything else is counted

Coverage SHALL be measured over all first-party source files, including files that no test imports, so that untested code lowers the measured percentage instead of being invisible to it. A file SHALL be omitted from measurement only by appearing in a checked-in exclusion list, and each entry SHALL carry a written reason. Third-party code, generated code, test files and test helpers are not first-party source and are outside the measured scope.

#### Scenario: A new untested module lowers coverage

- **WHEN** a source file is added and no test exercises it
- **THEN** its lines count as uncovered in the totals rather than being skipped because nothing imported it

#### Scenario: Exclusions are enumerated, never implicit

- **WHEN** the coverage configuration is inspected
- **THEN** every excluded first-party file is listed individually with the reason it cannot be measured (process entry point, type-only module), and no wildcard silently removes measurable source

### Requirement: Every specification scenario traces to a verifying test

Every `#### Scenario:` under `openspec/specs/**/spec.md` SHALL be verified by at least one automated test that declares the link with a `// @covers <scenario-id>` annotation, where `<scenario-id>` is derived deterministically from the capability, requirement heading and scenario heading. A checker SHALL enforce this and SHALL exit non-zero when any scenario is neither annotated nor waived.

#### Scenario: An unverified scenario fails the check

- **WHEN** a requirement gains a new scenario and no test annotates it
- **THEN** the traceability check exits non-zero and names the unverified scenario

#### Scenario: A renamed scenario invalidates its stale annotations

- **WHEN** a requirement or scenario heading is reworded so its derived ID changes
- **THEN** the traceability check exits non-zero, reporting both the annotation that now points at nothing and the scenario that is now unverified

#### Scenario: Both languages carry annotations

- **WHEN** a scenario is verified by a Rust test and another by a TypeScript test
- **THEN** the checker recognises both annotations and treats each scenario as verified

### Requirement: A scenario that cannot be automated requires a recorded waiver

A scenario SHALL be exempt from the annotation requirement only by an entry in the checked-in waiver list, and that entry SHALL state why automation is not possible and the manual procedure that verifies it instead. A waiver SHALL NOT silence a scenario that is in fact verified by a test, and SHALL NOT name a scenario that does not exist.

#### Scenario: A justified waiver satisfies the check

- **WHEN** a scenario requires hardware or an environment CI cannot provide and is waived with a reason and a manual verification procedure
- **THEN** the traceability check passes and reports the scenario as waived rather than as verified

#### Scenario: An unjustified waiver is rejected

- **WHEN** a waiver entry omits its reason or its manual verification procedure
- **THEN** the traceability check exits non-zero

#### Scenario: A stale waiver is rejected

- **WHEN** a waived scenario later gains a covering test annotation, or a waiver names a scenario that no longer exists
- **THEN** the traceability check exits non-zero so the waiver list cannot outlive its justification

### Requirement: The traceability matrix is reportable

The checker SHALL be able to emit a human-readable matrix listing every requirement and scenario in the specifications together with the tests that verify it or the waiver that exempts it, so a reviewer can audit verification without reading the checker's source.

#### Scenario: Reviewer reads the matrix

- **WHEN** the checker is run in report mode
- **THEN** it prints every capability, requirement and scenario with either the file and name of each verifying test or the waiver reason, and a summary count of verified, waived and unverified scenarios

### Requirement: Continuous integration runs every gate

The repository SHALL define a CI pipeline that runs the frontend tests with coverage, the backend tests with coverage, and the traceability check on every push to the repository. No gate SHALL be advisory: a failing gate SHALL fail the pipeline.

#### Scenario: All gates run on every push

- **WHEN** a commit is pushed to any branch
- **THEN** the pipeline runs the frontend coverage gate, the backend coverage gate and the traceability check

#### Scenario: No gate is advisory

- **WHEN** the CI configuration is inspected
- **THEN** no gate step is allowed to fail without failing its job — none is marked to continue on error or has its exit status suppressed
