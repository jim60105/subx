# match-workflow Delta

## MODIFIED Requirements

### Requirement: Multi-source selection with scan preview and relocation mode

Step 1 SHALL accept folders, video/subtitle files, and archives (expanded by the crate, recording each file's archive origin) via drag-and-drop or browser, and offer the relocation choice rename in place / copy / move, defaulting to rename in place. Before any AI call it SHALL show a scan preview of videos and subtitles found, and SHALL explain and block proceeding when either is missing. Only the source list SHALL scroll, and each relocation option SHALL demonstrate its effect as a diff.

#### Scenario: Mixed sources are scanned

- **WHEN** the user adds a folder, a standalone subtitle file, and a zip archive and the scan completes
- **THEN** the preview shows the combined video and subtitle counts from all sources, including files found inside the archive

#### Scenario: Insufficient sources block progress

- **WHEN** the scan finds videos but zero subtitles
- **THEN** the wizard shows a localized explanation and the next action remains disabled

#### Scenario: Relocation mode feeds the analysis

- **WHEN** the user selects copy mode in Step 1 and starts the analysis
- **THEN** the resulting plan's operations carry copy relocation, and the review step shows target paths in the videos' directories

#### Scenario: Relocation choice stays outside the scrolling list

- **WHEN** Step 1 lists far more sources than fit the window
- **THEN** the relocation choice is rendered outside the step's only scrolling region, which contains the source list and nothing else

#### Scenario: Each relocation option demonstrates its effect

- **WHEN** Step 1 renders the relocation choice
- **THEN** the rename option shows one removed and one created line, the copy option one kept and one created line, and the move option one removed and one created line, and each option's explanatory sentence is its accessible description rather than visible text
