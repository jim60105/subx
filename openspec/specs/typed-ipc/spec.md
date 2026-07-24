# typed-ipc Specification

## Purpose

The IPC contract between the Rust command layer and the TypeScript frontend:
types and command signatures generated from the Rust definitions rather than
transcribed, committed as a reviewable artifact, protected against drift, and
reached only through the generated bindings. This capability exists so that the
claim "the TypeScript mirrors the backend" is enforced by a gate instead of by
a comment.

## Requirements

### Requirement: The TypeScript IPC contract is generated from the Rust definitions

Every type that crosses the Tauri IPC boundary SHALL have its TypeScript declaration generated from the Rust definition rather than transcribed by hand, including the field-name translation the Rust serialization performs. No hand-written TypeScript interface SHALL describe a payload the backend produces or consumes.

#### Scenario: A renamed backend field changes the generated contract

- **WHEN** a field in a Rust DTO is renamed or retyped
- **THEN** the regenerated TypeScript declaration changes accordingly, and any frontend code still using the old name fails to type-check

#### Scenario: Serialization renaming is reflected, not re-derived

- **WHEN** a Rust DTO declares a serialization rename such as `snake_case` to `camelCase`
- **THEN** the generated TypeScript uses the serialized name, so the declaration matches what actually crosses the boundary rather than what the Rust field is called

#### Scenario: An optional field is declared as the wire actually carries it

- **WHEN** a DTO field may be absent, and the generated declaration and the serialized payload could disagree about how that absence appears — a missing key versus an explicit null
- **THEN** the two agree: the declared type describes what the frontend actually receives, so narrowing the field by its declared form is correct at runtime rather than merely type-correct

### Requirement: Command signatures come from the same source as the handler registration

The registration of Tauri command handlers and the generation of their TypeScript signatures SHALL derive from one declaration, so a command cannot be registered without a generated binding or generated without being registered. Each command's argument types and its success and error result types SHALL be expressed in the generated bindings.

#### Scenario: A new command is reachable only once it is declared

- **WHEN** a command is added to the shared declaration
- **THEN** it is both registered as an invokable handler and present in the generated bindings with its argument and result types

#### Scenario: The error type is part of the contract

- **WHEN** a command fails
- **THEN** the structured error DTO is part of the generated output, so the frontend's narrowing helper is defined against the generated type and breaks at compile time if the backend's error shape changes

#### Scenario: There is no second registration path

- **WHEN** the backend source is inspected
- **THEN** the shared declaration is constructed in exactly one place and no other command list exists — neither a macro-based handler registration nor a second builder construction — so the runtime handlers and the generated bindings cannot be assembled from different lists

### Requirement: Generated bindings are committed and protected against drift

The generated TypeScript SHALL be committed to the repository as a reviewable artifact, and a gate SHALL fail when the committed file differs from what the current Rust definitions produce. Generation SHALL be reproducible from a plain checkout without requiring an application build.

#### Scenario: Stale committed bindings fail the gate

- **WHEN** a Rust DTO or command changes and the committed bindings are not regenerated
- **THEN** the drift gate regenerates them, detects the difference and exits non-zero

#### Scenario: Regeneration is deterministic

- **WHEN** generation runs twice against unchanged Rust definitions
- **THEN** it produces byte-identical output, so the gate cannot fail on incidental ordering or formatting

### Requirement: The frontend reaches the backend only through the generated bindings

Frontend code SHALL invoke commands through the generated bindings. A raw invocation that names a command by string literal SHALL NOT appear outside the generated module, since it bypasses every guarantee this capability provides.

#### Scenario: A hand-rolled invocation is rejected

- **WHEN** frontend source outside the generated module invokes a command by string name
- **THEN** the check fails and names the offending file

#### Scenario: Domain wrappers remain permitted

- **WHEN** a feature module wraps a generated binding to add domain concerns such as key mapping or field ordering
- **THEN** the check passes, because the wrapper calls the generated function rather than naming a command itself

### Requirement: The runtime error guard survives generation

The generated bindings describe types only. The runtime narrowing helper the frontend uses to recognise a structured error at a catch site SHALL remain hand-written, SHALL be tested, and SHALL be defined against the generated error type so it cannot drift from it.

#### Scenario: An unknown rejection is narrowed

- **WHEN** a caught rejection carries the structured error shape
- **THEN** the guard narrows it to the generated error type; and when it does not, the guard rejects it so the caller can fall back

### Requirement: Events are typed by the same mechanism

Backend-to-frontend events SHALL carry generated payload types produced by the same declaration as the commands, so a feature that emits events does not reintroduce hand-written payload mirrors.

#### Scenario: The event mechanism is wired before it is needed

- **WHEN** the bindings are generated for a backend that declares no events yet
- **THEN** the event collection is part of the declaration and the generated output, so adding an event later requires declaring it rather than establishing the mechanism

