## MODIFIED Requirements

### Requirement: Continuous integration runs every gate

The repository SHALL define a CI pipeline that runs the frontend tests with coverage, the backend tests with coverage, the traceability check, and the IPC bindings drift check on every push to the repository. The pipeline SHALL configure Node.js steps using the Current LTS release line (`lts/*`) so that verification gates execute on active supported LTS runtimes. No gate SHALL be advisory: a failing gate SHALL fail the pipeline.

#### Scenario: All gates run on every push

- **WHEN** a commit is pushed to any branch
- **THEN** the pipeline runs the frontend coverage gate, the backend coverage gate, the traceability check and the bindings drift check

#### Scenario: No gate is advisory

- **WHEN** the CI configuration is inspected
- **THEN** no gate step is allowed to fail without failing its job — none is marked to continue on error or has its exit status suppressed

#### Scenario: CI steps pin Node.js to Current LTS

- **WHEN** CI workflow steps configure Node.js via `actions/setup-node`
- **THEN** the `node-version` parameter is specified as `'lts/*'` across all workflow jobs
