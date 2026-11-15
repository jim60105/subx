# diff-preview Delta

## Purpose

How the application shows what an operation will do to files: each consequence is one line marked as removed, created, or kept, readable by assistive technology without relying on colour, so a design can demonstrate an outcome instead of describing it in a sentence.

## ADDED Requirements

### Requirement: File consequences render as marked lines

A diff preview SHALL render each file consequence as one line of exactly one kind: removed, created, or kept. Removed and created lines SHALL each carry their own visible mark; kept lines SHALL carry none. The kind SHALL be conveyed to assistive technology as text rather than by colour or strike-through alone, unless the preview is declared decorative, in which case the whole preview SHALL be hidden from assistive technology.

#### Scenario: Each kind has its own mark

- **WHEN** a preview renders one removed, one created, and one kept line
- **THEN** the removed and created lines each show a different mark and identify their kind in the markup, and the kept line shows no mark

#### Scenario: Kinds are announced as text

- **WHEN** a non-decorative preview renders a removed, a created, and a kept line
- **THEN** each line contains localized text naming its kind that is available to assistive technology, and the visible mark is hidden from it

#### Scenario: A decorative preview is hidden from assistive technology

- **WHEN** a preview is declared decorative
- **THEN** the whole preview is excluded from the accessibility tree
