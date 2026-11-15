# translate-workflow Delta

## ADDED Requirements

### Requirement: Translate sources step demonstrates accepted inputs

The Translate sources step SHALL present its accepted inputs through the shared source-intake drop zone — folder, subtitle, and archive, and no video kind — and SHALL list the added sources in folder groups from which a single entry or a whole group can be removed. The sentence describing the accepted inputs SHALL remain available to assistive technology only.

#### Scenario: Drop zone shows the kinds Translate accepts

- **WHEN** the Translate sources step renders with no sources
- **THEN** the drop zone shows folder, subtitle, and archive glyphs, shows no video glyph, and the descriptive sentence is present only as visually hidden text

#### Scenario: Removing a folder group rescans without it

- **WHEN** two sources from one folder and one from another are listed and the user removes the first folder's group
- **THEN** only the other folder's source remains listed and the scan is requested again for exactly that source

### Requirement: Planned translations render as file consequences

The Translate options step SHALL render every planned translation as a diff. In suffix mode the input SHALL be a kept line and the output path a created line. In replace mode the input SHALL be a removed line and the same path a created line. An excluded item SHALL show its exclusion reason and no created line.

#### Scenario: Suffix mode keeps the input and creates the output

- **WHEN** the options step shows a runnable item in suffix mode
- **THEN** the item shows its input as a kept line and its resolved output path as a created line

#### Scenario: Replace mode removes and re-creates the file

- **WHEN** the options step shows a runnable item in replace mode
- **THEN** the item shows its input as a removed line and its output path as a created line

#### Scenario: Excluded item shows no created line

- **WHEN** the plan contains an item with an exclusion reason
- **THEN** that item shows its input as a kept line, its localized exclusion reason, and no created line
