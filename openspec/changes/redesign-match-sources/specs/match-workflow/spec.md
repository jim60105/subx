# match-workflow Delta

## MODIFIED Requirements

### Requirement: Multi-source selection with scan preview and relocation mode

Step 1 of the match wizard SHALL accept multiple sources via drag-and-drop or file browser, where each source may be a folder, an individual video/subtitle file, or a supported archive (expanded via the crate's input handling, which also records each extracted file's archive origin). Step 1 SHALL also offer the relocation mode choice — rename in place / copy / move — defaulting to rename in place. Before any AI call, the wizard SHALL show a scan preview with the number of videos and subtitles discovered. If the sources contain no videos or no subtitles, the wizard SHALL explain this and SHALL NOT allow proceeding. The relocation choice SHALL stay visible however many sources are listed: only the source list scrolls. Each relocation option SHALL demonstrate its effect on a sample file as a diff rather than describe it in a sentence.

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
- **THEN** the relocation choice is rendered outside the step's only scrolling region, which contains the source list and nothing else, and the step itself does not scroll

#### Scenario: Each relocation option demonstrates its effect

- **WHEN** Step 1 renders the relocation choice
- **THEN** the rename option shows one removed and one created line, the copy option one kept and one created line, and the move option one removed and one created line, and each option's explanatory sentence is its accessible description rather than visible text
