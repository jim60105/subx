# source-intake Specification

## Purpose
How a wizard takes its sources in: a drop zone that demonstrates which kinds of input it accepts instead of describing them, and a list of the added sources grouped by folder from which single entries or whole groups can be removed.

## Requirements

### Requirement: Drop zone demonstrates the accepted inputs

A source-intake drop zone SHALL show one glyph per accepted input kind instead of an explanatory sentence, and SHALL offer browse-files and browse-folder actions. With no sources listed it SHALL render in a large form in which each glyph carries a caption; once at least one source is listed it SHALL collapse to a compact form that keeps the glyphs and both actions. The explanatory sentence SHALL remain available to assistive technology.

#### Scenario: Empty drop zone shows every accepted kind

- **WHEN** a drop zone renders with no sources listed
- **THEN** it is in its large form and shows one captioned glyph for each accepted input kind it was given, in the given order

#### Scenario: Drop zone collapses after the first source

- **WHEN** a drop zone renders with at least one source listed
- **THEN** it is in its compact form and still contains one glyph per accepted kind and both browse actions

#### Scenario: Description is kept for assistive technology

- **WHEN** a drop zone renders in either form
- **THEN** the explanatory sentence is present as visually hidden text that describes the drop zone, and the glyphs are hidden from assistive technology

### Requirement: Sources are listed in folder groups

Listed sources SHALL be grouped by parent folder, groups ordered by when their first source was added. Each group SHALL show the folder path, the number of its entries, and an action that removes the whole group. Each entry SHALL show its file name with a kind glyph derived from its extension and its own remove action, which SHALL be operable by keyboard.

#### Scenario: Entries are grouped by parent folder

- **WHEN** sources from two folders are listed, added in interleaved order
- **THEN** exactly two groups are shown in the order their first source was added, each showing its folder path, its entry count, and only its own entries

#### Scenario: Removing a group removes all of its entries

- **WHEN** the user activates a group's remove action
- **THEN** every source of that group is requested for removal in one step and the sources of other groups are not

#### Scenario: Kind glyph follows the extension

- **WHEN** a video file, a subtitle file, an archive, and a path without an extension are listed
- **THEN** their entries are marked as video, subtitle, archive, and folder respectively

#### Scenario: Remove action is reachable by keyboard

- **WHEN** the user moves focus through the list with the keyboard and activates an entry's remove action
- **THEN** the action receives focus as a button and removal of exactly that source is requested
