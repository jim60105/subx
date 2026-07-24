//! Error mapping between `subx-cli` crate errors and the IPC boundary.
//!
//! The backend never emits translated text: `code` and `hint_code` are stable
//! machine-readable keys the frontend resolves through its i18n layer, while
//! `message` carries the raw English detail for diagnostic display.

use serde::Serialize;
use specta::Type;
use subx_cli::error::SubXError;

/// Structured error crossing the Tauri IPC boundary.
///
/// Every command returns `Result<T, ErrorDto>`.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ErrorDto {
    /// Stable machine-readable code, used as a localization key (e.g. `config.invalid_provider`).
    pub code: String,
    /// Raw English message for detail display; never shown as the primary text.
    pub message: String,
    /// Optional stable code for a recovery hint, also resolved by the frontend.
    pub hint_code: Option<String>,
}

impl ErrorDto {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            hint_code: None,
        }
    }

    pub fn with_hint(mut self, hint_code: impl Into<String>) -> Self {
        self.hint_code = Some(hint_code.into());
        self
    }
}

/// Generic mapping for crate errors, keyed off `SubXError::category()`.
///
/// `category()` is a closed, exhaustive, spec-locked mapping in `subx-cli`, so
/// every variant lands on a distinct `core.*` code rather than collapsing into
/// one bucket. The crate's `hint()` returns English prose, which must not cross
/// the IPC boundary; its *presence* is signalled by a `core.<category>.hint`
/// code that the frontend translates itself.
///
/// Feature commands SHOULD still map the failures they can anticipate to their
/// own, narrower codes (e.g. `config.invalid_provider`) before falling back to
/// this conversion — a category is precise enough to localize, but not always
/// precise enough to tell the user which field to fix.
impl From<SubXError> for ErrorDto {
    fn from(err: SubXError) -> Self {
        let category = err.category();
        let dto = ErrorDto::new(format!("core.{category}"), err.to_string());

        match err.hint() {
            Some(_) => dto.with_hint(format!("core.{category}.hint")),
            None => dto,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;

    #[test]
    fn maps_the_crate_category_to_a_distinct_code() {
        let dto: ErrorDto = SubXError::config("missing key").into();
        assert_eq!(dto.code, "core.config");
        assert!(dto.message.contains("missing key"));
    }

    #[test]
    fn signals_an_available_hint_with_a_stable_code() {
        let dto: ErrorDto = SubXError::NoInputSpecified.into();
        assert_eq!(dto.code, "core.no_input_specified");
        assert_eq!(
            dto.hint_code.as_deref(),
            Some("core.no_input_specified.hint")
        );
    }

    #[test]
    fn omits_the_hint_code_when_the_crate_offers_none() {
        let dto: ErrorDto = SubXError::UnsupportedFileType("mkv".to_string()).into();
        assert_eq!(dto.code, "core.unsupported_file_type");
        assert_eq!(dto.hint_code, None);
    }

    /// An absent hint travels as an explicit `null`, and the generated
    /// declaration says `hintCode: string | null` — the same thing.
    ///
    /// This used to be the opposite assertion: `skip_serializing_if` omitted the
    /// key entirely and the hand-written mirror declared `hintCode?: string`.
    /// Generating the contract forced the choice, because specta's unified mode
    /// cannot express conditional omission, and a type that disagrees with the
    /// wire is the defect this capability exists to remove. The wire moved, so
    /// this pins the wire.
    // @covers typed-ipc/the-typescript-ipc-contract-is-generated-from-the-rust-definitions#an-optional-field-is-declared-as-the-wire-actually-carries-it
    #[test]
    fn an_absent_hint_travels_as_an_explicit_null() {
        let json = serde_json::to_value(ErrorDto::new("core.test", "detail")).unwrap();

        assert_eq!(json["code"], "core.test");
        assert!(
            json.get("hintCode").is_some_and(Value::is_null),
            "an absent hint must serialize as null, matching `hintCode: string | null`: {json}"
        );

        let hinted = serde_json::to_value(ErrorDto::new("core.test", "d").with_hint("core.test.hint"))
            .unwrap();
        assert_eq!(hinted["hintCode"], "core.test.hint");
    }
}
