# localization Specification

## ADDED Requirements

### Requirement: UI is localized in English and Traditional Chinese

All user-facing UI strings SHALL be resolved through the i18n layer (i18next) with English (`en`) as the default language and Traditional Chinese (`zh-TW`) as a complete second locale. No user-facing string in the frontend SHALL be hard-coded.

#### Scenario: Complete zh-TW coverage

- **WHEN** the language is set to `zh-TW` and the user visits any shell screen
- **THEN** every UI string renders in Traditional Chinese with no untranslated fallback visible

### Requirement: System locale detection on first launch

On first launch (no persisted language preference), the application SHALL select `zh-TW` when the system locale belongs to the Traditional Chinese family (e.g., `zh-TW`, `zh-Hant`) and `en` otherwise.

#### Scenario: Traditional Chinese system

- **WHEN** the app first launches with system locale `zh-TW`
- **THEN** the UI renders in Traditional Chinese

#### Scenario: Any other system locale

- **WHEN** the app first launches with system locale `ja-JP`
- **THEN** the UI renders in English

### Requirement: Runtime language switching with persistence

The user SHALL be able to switch the language at runtime; the UI SHALL update immediately without restart, and the choice SHALL persist across restarts in GUI-local storage.

#### Scenario: Immediate switch

- **WHEN** the user switches the language from English to Traditional Chinese
- **THEN** all visible strings re-render in Traditional Chinese without an app restart

### Requirement: Backend error codes are localized by the frontend

The Rust backend SHALL never emit translated text. The frontend SHALL map `ErrorDto.code` and `hint_code` values to localized messages, and SHALL show a generic localized fallback (plus the raw English `message` as detail) for unknown codes.

#### Scenario: Known error code

- **WHEN** a command fails with a code that has translations
- **THEN** the user sees the localized message for the active language

#### Scenario: Unknown error code

- **WHEN** a command fails with a code missing from the locale files
- **THEN** the user sees a generic localized error message with the raw English detail available
