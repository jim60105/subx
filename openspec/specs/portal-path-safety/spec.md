# portal-path-safety Specification

## Purpose

Keeps SubX from reporting success for a file it wrote directly inside an xdg document-portal document directory, where a newly created or renamed file is backed by a hidden temporary host file that the portal may delete. Such writes are recognized from the path and refused with a localized reason in every workflow that writes files.

## Requirements

### Requirement: Portal document entries are recognized from the path alone

The backend SHALL classify a path as a portal document entry exactly when it is absolute and has the form `/run/user/<decimal digits>/doc/<doc-id>/<name>` or `/run/user/<decimal digits>/doc/by-app/<app-id>/<doc-id>/<name>`, with no further components. Classification SHALL be decided from the path text alone, without accessing the filesystem.

#### Scenario: A file directly inside a document directory is an entry

- **WHEN** the path `/run/user/1000/doc/a1b2c3d4/movie.tc.ass` is classified
- **THEN** it is a portal document entry

#### Scenario: A file inside a directory document is not an entry

- **WHEN** the path `/run/user/1000/doc/a1b2c3d4/Season 1/movie.ass` is classified
- **THEN** it is not a portal document entry

#### Scenario: The per-application view is recognized

- **WHEN** the path `/run/user/1000/doc/by-app/im.chenj.subx/a1b2c3d4/movie.ass` is classified
- **THEN** it is a portal document entry, and `/run/user/1000/doc/by-app/im.chenj.subx/a1b2c3d4/Season 1/movie.ass` is not

#### Scenario: Ordinary and malformed paths are not entries

- **WHEN** each of `/home/user/doc/a1b2c3d4/movie.ass`, `/run/user/1000/gvfs/share/movie.ass`, `/run/user/abc/doc/a1b2c3d4/movie.ass`, `/run/user/1000/doc/a1b2c3d4`, the relative path `run/user/1000/doc/a1b2c3d4/movie.ass`, and `/run/user/1000/doc/a1b2c3d4/../x/movie.ass` is classified
- **THEN** none of them is a portal document entry

### Requirement: Match execution refuses operations that target a portal document entry

Match execution SHALL NOT hand to the engine any selected operation whose final target path is a portal document entry. Each such operation SHALL be reported as not applied with error code `path.portal_document_target` and hint code `path.portal_document_target.hint`. The other selected operations SHALL execute, and the report SHALL list outcomes in selection order.

#### Scenario: A copy into a single-file document is refused

- **WHEN** a selected copy-mode operation has an existing subtitle as its source and `/run/user/1000/doc/a1b2c3d4/v.srt` as its target
- **THEN** its outcome is not applied, carries error code `path.portal_document_target` with hint code `path.portal_document_target.hint`, is counted as a failure, and the source subtitle still exists with its original content

#### Scenario: A rename in place inside a single-file document is refused

- **WHEN** a selected rename-in-place operation has the subtitle `/run/user/1000/doc/a1b2c3d4/s.srt` and the new name `v.srt`
- **THEN** its outcome is not applied and carries error code `path.portal_document_target`

#### Scenario: Other operations still execute in selection order

- **WHEN** three operations are selected and only the second targets a portal document entry
- **THEN** the report lists three outcomes in selection order, the first and third are applied and their subtitles carry their new names on disk, the second is not applied, the success count is 2 and the failure count is 1

### Requirement: Convert and translate previews exclude outputs that are portal document entries

A convert or translate preview SHALL mark an item whose resolved output path is a portal document entry as excluded with skip reason `path.portal_document_target`. The exclusion SHALL NOT be lifted by the translate overwrite option, and SHALL apply in translate replace mode, where the output is the input itself.

#### Scenario: A convert preview excludes the item

- **WHEN** a convert preview resolves two items and only one item's output path is classified as a portal document entry
- **THEN** that item carries skip reason `path.portal_document_target` and is not flagged as an overwrite, and the other item carries no skip reason

#### Scenario: A translate preview keeps the exclusion when overwrite is enabled

- **WHEN** a suffix-mode translate preview with the overwrite option enabled resolves an item whose output path is classified as a portal document entry
- **THEN** that item carries skip reason `path.portal_document_target`

#### Scenario: Translate replace mode is excluded

- **WHEN** a replace-mode translate preview resolves an item whose own path is classified as a portal document entry
- **THEN** that item carries skip reason `path.portal_document_target`

### Requirement: Sync apply refuses an output that is a portal document entry

Applying a sync offset SHALL fail with error code `path.portal_document_target` and hint code `path.portal_document_target.hint` when the output path, whether given explicitly or derived by default from the subtitle path, is a portal document entry. The refusal SHALL happen before the subtitle is read and SHALL write no file.

#### Scenario: An explicit output inside a document directory is refused

- **WHEN** a sync offset is applied to an existing subtitle with the explicit output path `/run/user/1000/doc/a1b2c3d4/movie_synced.srt`
- **THEN** the apply fails with error code `path.portal_document_target` and hint code `path.portal_document_target.hint`, and the subtitle's content is unchanged

#### Scenario: A default output beside a single-file document is refused before reading

- **WHEN** a sync offset is applied to the subtitle path `/run/user/1000/doc/a1b2c3d4/movie.srt`, which does not exist on the test machine, with no explicit output path
- **THEN** the apply fails with error code `path.portal_document_target` rather than with a file-reading error

### Requirement: The refusal code is localizable

The codes `path.portal_document_target` and `path.portal_document_target.hint` SHALL be discovered by the backend-code parity scan and SHALL each have an entry in every shipped locale's error resource.

#### Scenario: The parity scan finds the code and both locales translate it

- **WHEN** the backend sources are scanned for emitted error codes
- **THEN** the scan yields `path.portal_document_target` and `path.portal_document_target.hint`, and both the `en` and the `zh-TW` error resources contain an entry for each