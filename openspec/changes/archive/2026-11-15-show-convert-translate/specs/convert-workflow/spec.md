# convert-workflow Delta

## ADDED Requirements

### Requirement: Convert sources step demonstrates accepted inputs

The Convert sources step SHALL present its accepted inputs through the shared source-intake drop zone — folder, subtitle, and archive, and no video kind — and SHALL list the added sources in folder groups from which a single entry or a whole group can be removed. The sentence describing the accepted inputs SHALL remain available to assistive technology only.

#### Scenario: Drop zone shows the kinds Convert accepts

- **WHEN** the Convert sources step renders with no sources
- **THEN** the drop zone shows folder, subtitle, and archive glyphs, shows no video glyph, and the descriptive sentence is present only as visually hidden text

#### Scenario: Removing a folder group rescans without it

- **WHEN** two sources from one folder and one from another are listed and the user removes the first folder's group
- **THEN** only the other folder's source remains listed and the scan is requested again for exactly that source

### Requirement: Planned conversions render as file consequences

The Convert options step SHALL render every planned conversion as a diff: its output path as a created line, and its input as a kept line while keep-original is on or as a removed line while it is off. An excluded item SHALL show its exclusion reason and no created line. Before the batch starts, the run step SHALL list the selected conversions with the same lines instead of a sentence about the originals.

#### Scenario: Keep-original on keeps the source line

- **WHEN** the options step shows a runnable item with keep-original on
- **THEN** the item shows its input as a kept line and its resolved output path as a created line

#### Scenario: Keep-original off marks the source removed

- **WHEN** the user turns keep-original off
- **THEN** every runnable item shows its input as a removed line and its output as a created line

#### Scenario: Excluded item shows no created line

- **WHEN** the plan contains an item with an exclusion reason
- **THEN** that item shows its input as a kept line, its localized exclusion reason, and no created line

#### Scenario: Run step lists the selected conversions before starting

- **WHEN** the run step opens with two of three items selected and keep-original off
- **THEN** it lists exactly the two selected items, each with a removed input line and a created output line
