# Spec Delta

## ADDED Requirements

### Requirement: Operation language follows the resulting file name

The backend SHALL report each operation's language as the normalized language tag its resulting file name carries between the video's base name and the subtitle extension. Only when that name carries no language tag SHALL it report the language detected from the subtitle's source path, or none when neither yields one.

#### Scenario: The tag in the resulting name decides the language

- **WHEN** a subtitle whose source path carries no language marker will become `show.sc.srt` beside `show.mkv`
- **THEN** its operation reports the language `sc`

#### Scenario: A language the path detector does not know is reported

- **WHEN** a subtitle will become `show.th.srt` beside `show.mkv`
- **THEN** its operation reports the language `th`

#### Scenario: The resulting name outranks the source path

- **WHEN** a subtitle whose source path is detected as English will become `show.sc.srt` beside `show.mkv`
- **THEN** its operation reports the language `sc`

#### Scenario: Spellings of one language share one code

- **WHEN** three subtitles will become `show.CHT.srt`, `show.zh-TW.srt`, and `show.tc.2.srt` beside `show.mkv`
- **THEN** all three operations report the language `tc`

#### Scenario: Text belonging to the video name is not a language

- **WHEN** a subtitle without any language marker in its source path will become `show.en.srt` beside `show.en.mkv`
- **THEN** its operation reports no language

#### Scenario: A suffix that is not a language falls back to the source path

- **WHEN** one subtitle whose source path is detected as English and one whose source path carries no marker will become `show.2.srt` and `show.forced.srt` beside `show.mkv`
- **THEN** the first operation reports `en` and the second reports no language

### Requirement: Quick-select names languages without a hand-written label

A quick-select control for a two- or three-letter language code that has no translated label SHALL be named by the platform's language names in the current interface language. A code the platform cannot name, or any other code form, SHALL be shown verbatim.

#### Scenario: A code without a translated label is localized

- **WHEN** the review step renders an operation with language `th` in English and then in Traditional Chinese
- **THEN** its control is named with the platform's English and Traditional Chinese names for Thai, not with the bare code

#### Scenario: A code the platform cannot name is shown verbatim

- **WHEN** the review step renders operations with languages `qqq` and `x_y`
- **THEN** each control is named with its code

### Requirement: Whole-row selection toggle

Activating the pointer's primary button anywhere on a pairing row SHALL toggle that operation's selection exactly once, except on a nested interactive control, which SHALL only perform its own action, and except when the pointer gesture selects text. The row itself SHALL NOT be focusable or expose an interactive role; the checkbox SHALL remain the keyboard and assistive-technology control.

#### Scenario: Clicking row content toggles the row

- **WHEN** the user clicks a pairing's video name, subtitle name, or resulting name
- **THEN** that operation's selection toggles once per click and no other operation changes

#### Scenario: Clicking the checkbox toggles exactly once

- **WHEN** the user clicks a pairing's checkbox, or focuses it and presses Space
- **THEN** that operation's selection toggles exactly once

#### Scenario: The disclosure does not change selection

- **WHEN** the user opens or closes a pairing's reasoning disclosure by pointer or keyboard
- **THEN** the disclosure state changes and the operation's selection does not

#### Scenario: Revealed reasoning text belongs to the row

- **WHEN** the user clicks reasoning text shown in a pairing row
- **THEN** that operation's selection toggles once and an open disclosure stays open

#### Scenario: Selecting text does not toggle

- **WHEN** the user drags to select text inside a pairing row
- **THEN** no operation's selection changes

#### Scenario: A double click is two toggles

- **WHEN** the user double-clicks a pairing's subtitle name
- **THEN** the operation's selection toggles twice and no word becomes selected

#### Scenario: Unmatched rows do not toggle

- **WHEN** the user clicks an unmatched row
- **THEN** no operation's selection changes

#### Scenario: The row adds no keyboard stop

- **WHEN** a pairing row is rendered
- **THEN** it carries no tab index and no role attribute, and its checkbox keeps its accessible name
