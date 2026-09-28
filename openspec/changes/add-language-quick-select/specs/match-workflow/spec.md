# match-workflow Delta

## ADDED Requirements

### Requirement: Language quick-select on review

The match review step SHALL show a quick-select bar above the operation list whenever the plan has at least one operation, including when all its operations fall into a single group. The bar has one control per subtitle language present in the plan, derived from a per-operation language code the backend attaches by detecting the language from the subtitle file's path (at most one code per operation); operations whose language cannot be detected form a single `Other` group. Each control shows its group's localized display name and the number of operations in the group, indicates a checked state while every operation of its group is selected and an indeterminate state while only some are, and is labelled for assistive technology by an explicit accessible name rather than by concatenating visible fragments. Activating a control selects every operation of its group when any of them is currently unselected (including the fully-cleared case, which reads as unchecked), and clears every operation of its group when all of them are currently selected. The controls SHALL stay in sync with the per-operation checkboxes in both directions, SHALL only change checkbox selection (never hide, reorder, or filter the listed operations), and SHALL leave the rule that the execute action is disabled while zero operations are selected unchanged.

#### Scenario: Quick-select bar reflects the languages actually present

- **WHEN** the review step renders a plan whose operations cover two Simplified Chinese subtitles, one Traditional Chinese subtitle, one English subtitle, and one subtitle whose language cannot be detected
- **THEN** the bar shows exactly one control per present group — the localized names for Simplified, Traditional, and English plus the `Other` control — each showing its group's operation count, and no control for a language absent from the plan

#### Scenario: Selecting a language selects all of its files

- **WHEN** the user activates the Traditional Chinese control while some — or none — of the Traditional Chinese operations are selected
- **THEN** every Traditional Chinese operation becomes selected, every other operation's selection is untouched, and the selected count updates

#### Scenario: Clearing a language clears only its files

- **WHEN** the user activates the Simplified Chinese control while all Simplified Chinese operations are selected
- **THEN** every Simplified Chinese operation becomes unselected and operations of other languages keep whatever selection they had

#### Scenario: Chips follow manual checkbox changes

- **WHEN** the user manually unchecks the last selected operation of a language via its row checkbox
- **THEN** that language's control shows the cleared state without any activation of the control itself

#### Scenario: All-unknown languages still get one control

- **WHEN** the plan's operations all carry an undetectable language
- **THEN** the bar shows a single `Other` control whose activation selects/clears every operation, and no language chips

#### Scenario: Quick-clear to zero blocks execution

- **WHEN** the user clears the last language group that still had a selected operation
- **THEN** the execute action is disabled until some operation is selected again, exactly as with manual deselection
