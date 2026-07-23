//! Configuration commands.
//!
//! Every read and write goes through the `subx-cli` crate's `ConfigService`,
//! which owns the shared `~/.config/subx/config.toml` the CLI also uses. The
//! GUI never parses or writes that file itself.

use std::time::Instant;

use serde_json::json;
use subx_cli::config::field_validator::normalize_ai_provider;
use subx_cli::config::{mask_sensitive_value, validate_field, ConfigService};
use subx_cli::core::ComponentFactory;
use subx_cli::error::SubXError;
use tauri::State;

use crate::dto::{AiConfigDto, ConfigDto, ConnectionTestResult, SetConfigRequest};
use crate::error::ErrorDto;
use crate::state::AppState;

/// Config key holding the AI credential; also the masking key.
const AI_API_KEY: &str = "ai.api_key";

/// Hint shown for every connection-test failure.
///
/// The crate's own hints are written for CLI users; on the settings screen the
/// actionable advice is always the same — the three fields right above the
/// button are what the user can change.
const CONNECTION_TEST_HINT: &str = "config.connection_test.hint";

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Result<ConfigDto, ErrorDto> {
    read_config(state.config_service())
}

#[tauri::command]
pub fn set_config_value(request: SetConfigRequest, state: State<AppState>) -> Result<(), ErrorDto> {
    write_config_value(state.config_service(), &request.key, &request.value)
}

#[tauri::command]
pub async fn test_ai_connection(
    state: State<'_, AppState>,
) -> Result<ConnectionTestResult, ErrorDto> {
    Ok(probe_ai_connection(state.config_service()).await)
}

/// Reads the current configuration with the API key masked.
///
/// Reloads first: `ProductionConfigService` caches the loaded config in-process
/// and never re-reads the file on its own, so without this the screen would
/// keep showing the first-load snapshot after a CLI or manual edit. Reloading
/// also restores the environment-variable overlay, which a preceding
/// `set_config_value` drops from the cache (it loads file-only by design).
fn read_config(service: &dyn ConfigService) -> Result<ConfigDto, ErrorDto> {
    service.reload()?;
    let config = service.get_config()?;

    let api_key = config.ai.api_key.unwrap_or_default();

    Ok(ConfigDto {
        ai: AiConfigDto {
            provider: config.ai.provider,
            model: config.ai.model,
            base_url: config.ai.base_url,
            api_key_masked: mask_sensitive_value(AI_API_KEY, &api_key),
            api_key_set: !api_key.is_empty(),
        },
    })
}

/// Writes one key and attributes a rejection to its field only when the value
/// itself is at fault.
///
/// The crate's `set_config_value` surfaces file-read, TOML-parse and file-write
/// failures — and a *different* already-invalid field found while reloading the
/// file — all as the same `SubXError::Config` variant as a genuine
/// value-validation rejection, so matching the variant alone cannot tell them
/// apart. Instead we pre-validate the value through the crate's own
/// `validate_field` (mirroring the write path's provider normalization): a
/// failure there is definitively this field's fault and gets a `config.invalid_*`
/// code, while anything `set_config_value` rejects afterwards is an I/O,
/// corruption or cross-section problem and keeps the honest generic mapping.
fn write_config_value(service: &dyn ConfigService, key: &str, value: &str) -> Result<(), ErrorDto> {
    // The write path canonicalizes the provider before validating, so aliases
    // like `ollama` (and case variants) must be normalized here too, otherwise
    // a value the crate would accept looks invalid.
    let normalized = if key == "ai.provider" {
        normalize_ai_provider(value)
    } else {
        value.to_string()
    };
    if let Err(err) = validate_field(key, &normalized) {
        return Err(
            ErrorDto::new(invalid_field_code(key), err.to_string()).with_hint(hint_for(key))
        );
    }

    service.set_config_value(key, value).map_err(ErrorDto::from)
}

/// Stable error code for a rejected value, derived from the key being written.
///
/// Derived from the key rather than the crate's message: `SubXError::Config`
/// carries free-form English prose, and matching on it would break the moment
/// upstream rewords an error.
fn invalid_field_code(key: &str) -> String {
    let suffix = match key {
        "ai.provider" => "invalid_provider",
        "ai.model" => "invalid_model",
        "ai.base_url" => "invalid_url",
        AI_API_KEY => "invalid_api_key",
        _ => "invalid_value",
    };
    format!("config.{suffix}")
}

fn hint_for(key: &str) -> String {
    format!("{}.hint", invalid_field_code(key))
}

/// Builds the configured provider and issues one minimal request.
///
/// Failure is a result, not a command error: the user asked "does this work?",
/// and "no, because …" is a complete answer.
async fn probe_ai_connection(service: &dyn ConfigService) -> ConnectionTestResult {
    let provider = match service
        .reload()
        .and_then(|()| ComponentFactory::new(service))
        .and_then(|factory| factory.create_ai_provider())
    {
        Ok(provider) => provider,
        Err(err) => return failed_test(err),
    };

    let probe = vec![json!({ "role": "user", "content": "ping" })];
    let started = Instant::now();

    match provider.chat_completion(probe).await {
        Ok(_) => ConnectionTestResult {
            ok: true,
            latency_ms: Some(started.elapsed().as_millis() as u64),
            error: None,
        },
        Err(err) => failed_test(err),
    }
}

fn failed_test(err: SubXError) -> ConnectionTestResult {
    // "Check the three fields above" is the right advice only for failures those
    // fields can actually fix: building the provider (`config`), the provider
    // rejecting the request (`api`), or the service refusing it (`ai_service`,
    // which also covers a rejected key). A transport-class failure keeps the
    // crate's own hint rather than misdirecting the user at their settings.
    let points_at_settings = matches!(err.category(), "config" | "api" | "ai_service");
    let dto = ErrorDto::from(err);

    ConnectionTestResult {
        ok: false,
        latency_ms: None,
        error: Some(if points_at_settings {
            dto.with_hint(CONNECTION_TEST_HINT)
        } else {
            dto
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use subx_cli::config::{ProductionConfigService, TestConfigService, TestEnvironmentProvider};
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn service_with_key(api_key: &str) -> TestConfigService {
        TestConfigService::with_ai_settings_and_key("openai", "gpt-4.1-mini", api_key)
    }

    #[test]
    fn read_masks_the_api_key() {
        let service = service_with_key("sk-secret-value-1234");

        let dto = read_config(&service).expect("read must succeed");

        assert_eq!(dto.ai.api_key_masked, "****1234");
        assert!(dto.ai.api_key_set);
        assert_eq!(dto.ai.provider, "openai");
        assert_eq!(dto.ai.model, "gpt-4.1-mini");
    }

    #[test]
    fn read_reports_an_absent_key_as_unset() {
        let service = TestConfigService::with_ai_settings("openai", "gpt-4.1-mini");

        let dto = read_config(&service).expect("read must succeed");

        assert_eq!(dto.ai.api_key_masked, "");
        assert!(!dto.ai.api_key_set);
    }

    #[test]
    fn write_persists_a_valid_value() {
        let service = service_with_key("sk-secret-value-1234");

        write_config_value(&service, "ai.model", "gpt-4o-mini").expect("write must succeed");

        assert_eq!(read_config(&service).unwrap().ai.model, "gpt-4o-mini");
    }

    /// The provider `<select>` only offers canonical ids, but the crate also
    /// accepts `ollama` as an alias for `local` and rewrites it on the way in —
    /// so what the screen reads back is not always what it wrote.
    #[test]
    fn write_canonicalizes_a_provider_alias() {
        let service = service_with_key("sk-secret-value-1234");

        write_config_value(&service, "ai.provider", "ollama").expect("write must succeed");

        assert_eq!(read_config(&service).unwrap().ai.provider, "local");
    }

    #[test]
    fn rejected_values_carry_the_field_code_and_leave_the_value_unchanged() {
        let service = service_with_key("sk-secret-value-1234");

        let error = write_config_value(&service, "ai.base_url", "not a url")
            .expect_err("an invalid URL must be rejected");

        assert_eq!(error.code, "config.invalid_url");
        assert_eq!(error.hint_code.as_deref(), Some("config.invalid_url.hint"));
        assert_eq!(
            read_config(&service).unwrap().ai.base_url,
            subx_cli::config::Config::default().ai.base_url
        );
    }

    #[test]
    fn each_editable_field_maps_to_its_own_code() {
        assert_eq!(invalid_field_code("ai.provider"), "config.invalid_provider");
        assert_eq!(invalid_field_code("ai.model"), "config.invalid_model");
        assert_eq!(invalid_field_code("ai.base_url"), "config.invalid_url");
        assert_eq!(invalid_field_code(AI_API_KEY), "config.invalid_api_key");
        assert_eq!(invalid_field_code("ai.temperature"), "config.invalid_value");
    }

    /// A write that fails on disk — not because the value is bad — must keep the
    /// generic `core.config` mapping, never a `config.invalid_*` field code:
    /// telling the user their (valid) model name is wrong when the real problem
    /// is a failed write would send them fixing the wrong thing.
    #[test]
    fn a_write_failure_is_not_reported_as_an_invalid_value() {
        let dir = tempfile::tempdir().expect("temp dir");
        // Point the config path *inside* a regular file, so creating it fails
        // with ENOTDIR at write time even though the value is perfectly valid.
        let blocker = dir.path().join("blocker");
        std::fs::write(&blocker, "not a directory").unwrap();
        let path = blocker.join("config.toml");
        let mut env = TestEnvironmentProvider::new();
        env.set_var("SUBX_CONFIG_PATH", path.to_str().unwrap());
        let service = ProductionConfigService::with_env_provider(Arc::new(env)).expect("service");

        let error = write_config_value(&service, "ai.model", "gpt-4o-mini")
            .expect_err("the write to an impossible path must fail");

        assert_eq!(error.code, "core.config");
        assert_ne!(error.code, "config.invalid_model");
    }

    /// Exercises the real production service against a temporary config file:
    /// the in-memory `TestConfigService` never touches disk, so it cannot show
    /// that the GUI and the CLI actually share one store.
    #[test]
    fn the_config_file_is_the_shared_store() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("config.toml");
        let mut env = TestEnvironmentProvider::new();
        env.set_var("SUBX_CONFIG_PATH", path.to_str().unwrap());
        let service = ProductionConfigService::with_env_provider(Arc::new(env)).expect("service");

        write_config_value(&service, "ai.model", "gpt-4o-mini").expect("write must succeed");

        // What the GUI wrote is what the CLI reads.
        let on_disk = std::fs::read_to_string(&path).expect("config file must exist");
        assert!(on_disk.contains("gpt-4o-mini"), "{on_disk}");

        // ...and an edit made outside the GUI survives to the next read, which
        // only holds because the read reloads instead of trusting its cache.
        std::fs::write(&path, on_disk.replace("gpt-4o-mini", "edited-by-the-cli")).unwrap();
        assert_eq!(
            read_config(&service).expect("read must succeed").ai.model,
            "edited-by-the-cli"
        );
    }

    /// Points the crate's OpenAI client at a local mock and disables retries so
    /// the probe makes exactly one request.
    fn service_for(server: &MockServer) -> TestConfigService {
        let service = TestConfigService::with_defaults();
        service.set_ai_settings_with_base_url(
            "openai",
            "gpt-4.1-mini",
            "sk-test-key-value-1234",
            &server.uri(),
        );
        service.config_mut().ai.retry_attempts = 1;
        service
    }

    #[tokio::test]
    async fn connection_test_succeeds_against_a_working_endpoint() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "choices": [{ "message": { "content": "pong" } }]
            })))
            .mount(&server)
            .await;

        let result = probe_ai_connection(&service_for(&server)).await;

        assert!(result.ok);
        assert!(result.latency_ms.is_some());
        assert!(result.error.is_none());
    }

    #[tokio::test]
    async fn connection_test_reports_a_rejected_key_as_a_result_not_an_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(401).set_body_string("invalid_api_key"))
            .mount(&server)
            .await;

        let result = probe_ai_connection(&service_for(&server)).await;

        assert!(!result.ok);
        assert!(result.latency_ms.is_none());
        let error = result.error.expect("a failed test must explain itself");
        assert_eq!(error.code, "core.ai_service");
        assert_eq!(error.hint_code.as_deref(), Some(CONNECTION_TEST_HINT));
    }

    #[tokio::test]
    async fn connection_test_fails_before_any_request_when_the_key_is_missing() {
        let service = TestConfigService::with_ai_settings("openai", "gpt-4.1-mini");

        let result = probe_ai_connection(&service).await;

        assert!(!result.ok);
        let error = result.error.expect("a failed test must explain itself");
        assert_eq!(error.code, "core.config");
        assert_eq!(error.hint_code.as_deref(), Some(CONNECTION_TEST_HINT));
    }
}
