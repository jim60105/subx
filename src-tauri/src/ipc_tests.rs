//! Command-boundary tests.
//!
//! Every other backend test calls the extracted logic beneath a
//! `#[tauri::command]`, because the wrappers take `State<AppState>` and that
//! cannot exist without a running app. These drive the wrappers through the
//! real IPC path on `tauri::test`'s mock runtime, which additionally proves
//! three things nothing else covers: that each command is actually registered
//! by [`crate::bindings::specta_builder`], that its arguments deserialize from
//! the JavaScript-shaped payload, and that its success and error DTOs serialize
//! into the shape the frontend's TypeScript declares.
//!
//! This is the pattern the next feature's `commands/` module reuses.

use std::sync::Arc;

use serde_json::{json, Value};
use subx_cli::config::{ConfigService, TestConfigService};
use tauri::ipc::{CallbackFn, InvokeBody, InvokeResponseBody};
use tauri::utils::acl::ExecutionContext;
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, WebviewWindow, WebviewWindowBuilder};

use crate::state::AppState;

/// The commands the mock app is allowed to run.
///
/// `mock_context` starts with an empty ACL, so every command under test has to
/// be allowed explicitly. `the_allowlist_matches_the_declaration` keeps this
/// list from drifting away from the builder.
const COMMANDS: [&str; 16] = [
    "ping",
    "get_config",
    "set_config_value",
    "test_ai_connection",
    "list_source_files",
    "analyze_sources",
    "cancel_analysis",
    "execute_selected",
    "list_convert_inputs",
    "preview_conversion",
    "execute_conversion",
    "cancel_conversion",
    "get_sync_defaults",
    "detect_sync_offset",
    "cancel_sync_detection",
    "apply_sync_offset",
];

/// A mock app carrying the real command registration over the given service.
fn app_with(service: Arc<dyn ConfigService>) -> App<MockRuntime> {
    let mut context = mock_context(noop_assets());
    for command in COMMANDS {
        context
            .runtime_authority_mut()
            .__allow_command(command.to_string(), ExecutionContext::Local);
    }

    mock_builder()
        .manage(AppState::new(service))
        .invoke_handler(crate::bindings::specta_builder().invoke_handler())
        .build(context)
        .expect("the mock app must build")
}

fn webview(app: &App<MockRuntime>) -> WebviewWindow<MockRuntime> {
    WebviewWindowBuilder::new(app, "main", Default::default())
        .build()
        .expect("the mock webview must build")
}

/// Invoke a command exactly as the frontend's `invoke()` would.
fn invoke(webview: &WebviewWindow<MockRuntime>, command: &str, args: Value) -> Result<Value, Value> {
    get_ipc_response(
        webview,
        InvokeRequest {
            cmd: command.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            // The ACL classifies the origin from this URL; anything else is
            // treated as remote and denied.
            url: if cfg!(any(windows, target_os = "android")) {
                "http://tauri.localhost"
            } else {
                "tauri://localhost"
            }
            .parse()
            .unwrap(),
            body: InvokeBody::Json(args),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|body| match body {
        InvokeResponseBody::Json(text) => {
            serde_json::from_str(&text).expect("a command must answer with JSON")
        }
        InvokeResponseBody::Raw(bytes) => {
            panic!("unexpected raw response of {} bytes", bytes.len())
        }
    })
}

fn service_with_key() -> Arc<dyn ConfigService> {
    Arc::new(TestConfigService::with_ai_settings_and_key(
        "openai",
        "gpt-4.1-mini",
        "sk-secret-value-1234",
    ))
}

/// The allowlist above is a second list of command names, and a second list is
/// exactly how a test suite ends up passing against commands the real app never
/// exposes. Pin it to the declaration itself.
#[test]
fn the_allowlist_matches_the_declaration() {
    let bindings_rs = include_str!("bindings.rs");
    let registration = bindings_rs
        .split_once("collect_commands![")
        .expect("specta_builder must declare its commands with collect_commands!")
        .1
        .split_once(']')
        .expect("the command list must be closed")
        .0;

    let mut registered: Vec<&str> = registration
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        // A commented-out command must not silently drop out of the check.
        .map(|entry| {
            assert!(
                !entry.contains("//"),
                "comment inside collect_commands! breaks the registration check: {entry}"
            );
            entry.rsplit("::").next().expect("a command path")
        })
        .collect();
    registered.sort_unstable();

    let mut allowed = COMMANDS.to_vec();
    allowed.sort_unstable();

    assert_eq!(
        registered, allowed,
        "COMMANDS must list exactly the commands specta_builder declares"
    );
}

#[test]
fn ping_crosses_the_boundary_with_its_camel_cased_fields() {
    let app = app_with(service_with_key());
    let response = invoke(&webview(&app), "ping", json!({})).expect("ping must succeed");

    assert_eq!(response["message"], "pong");
    // `app_version` is renamed on the wire; the frontend declares `appVersion`.
    assert_eq!(response["appVersion"], env!("CARGO_PKG_VERSION"));
}

#[test]
fn get_config_returns_the_masked_dto_the_frontend_declares() {
    let app = app_with(service_with_key());
    let response = invoke(&webview(&app), "get_config", json!({})).expect("get_config must succeed");

    let ai = &response["ai"];
    assert_eq!(ai["provider"], "openai");
    assert_eq!(ai["model"], "gpt-4.1-mini");
    assert_eq!(ai["apiKeyMasked"], "****1234");
    assert_eq!(ai["apiKeySet"], true);
    // The cleartext key must never reach the webview.
    assert!(
        !response.to_string().contains("sk-secret-value-1234"),
        "the cleartext API key crossed the IPC boundary: {response}"
    );
}

#[test]
fn set_config_value_deserializes_the_request_and_persists_it() {
    let app = app_with(service_with_key());
    let view = webview(&app);

    let response = invoke(
        &view,
        "set_config_value",
        json!({ "request": { "key": "ai.model", "value": "gpt-4o-mini" } }),
    )
    .expect("set_config_value must succeed");
    assert_eq!(response, Value::Null);

    let after = invoke(&view, "get_config", json!({})).expect("get_config must succeed");
    assert_eq!(after["ai"]["model"], "gpt-4o-mini");
}

// @covers app-shell/thin-tauri-command-layer-structure#command-failure-yields-a-structured-error
#[test]
fn a_rejected_value_crosses_the_boundary_as_an_error_dto() {
    let app = app_with(service_with_key());

    let error = invoke(
        &webview(&app),
        "set_config_value",
        json!({ "request": { "key": "ai.base_url", "value": "not a url" } }),
    )
    .expect_err("an invalid URL must be rejected");

    assert_eq!(error["code"], "config.invalid_url");
    assert_eq!(error["hintCode"], "config.invalid_url.hint");
    assert!(
        error["message"].is_string(),
        "the raw English message must be available for detail display: {error}"
    );
}

/// The async command reaches the webview through the same path; without this
/// nothing proves an `async` wrapper is wired correctly.
#[test]
fn the_async_connection_test_answers_over_ipc() {
    let app = app_with(Arc::new(TestConfigService::with_ai_settings(
        "openai",
        "gpt-4.1-mini",
    )));

    let response = invoke(&webview(&app), "test_ai_connection", json!({}))
        .expect("the connection test reports failure as a result, never as an error");

    assert_eq!(response["ok"], false);
    // The generated contract declares `latencyMs: number | null`, so an absent
    // latency must arrive as an explicit null rather than as a missing key.
    assert!(
        response.get("latencyMs").is_some_and(Value::is_null),
        "a failed test must report a null latency, not a missing key: {response}"
    );
    assert_eq!(response["error"]["code"], "core.config");
    assert_eq!(response["error"]["hintCode"], "config.connection_test.hint");
}

/// `list_source_files` crosses the boundary and deserializes its `paths`
/// argument into the counts DTO. Empty sources are a valid `(0, 0)` result.
#[test]
fn list_source_files_answers_over_ipc_with_camel_cased_counts() {
    let app = app_with(service_with_key());

    let response = invoke(&webview(&app), "list_source_files", json!({ "paths": [] }))
        .expect("list_source_files must succeed on empty sources");

    assert_eq!(response["videoCount"], 0);
    assert_eq!(response["subtitleCount"], 0);
}

/// `cancel_analysis` reaches the webview and resolves with no payload even when
/// nothing is running — cancelling twice must be harmless.
#[test]
fn cancel_analysis_answers_over_ipc() {
    let app = app_with(service_with_key());

    let response =
        invoke(&webview(&app), "cancel_analysis", json!({})).expect("cancel must succeed");

    assert_eq!(response, Value::Null);
}

/// `execute_selected` deserializes its `planId`/`operationIds` and, with no plan
/// stored, crosses back the stale-plan error as an `ErrorDto`.
// @covers match-workflow/execution-with-per-item-report#stale-plan-is-rejected
#[test]
fn execute_selected_rejects_an_unknown_plan_over_ipc() {
    let app = app_with(service_with_key());

    let error = invoke(
        &webview(&app),
        "execute_selected",
        json!({ "planId": "plan-does-not-exist", "operationIds": [] }),
    )
    .expect_err("an unknown plan id must be rejected");

    assert_eq!(error["code"], "match.stale_plan");
    assert_eq!(error["hintCode"], "match.stale_plan.hint");
}

/// `list_convert_inputs` crosses the boundary and deserializes its `paths`
/// argument into the counts DTO. Empty sources are a valid `0` result.
#[test]
fn list_convert_inputs_answers_over_ipc_with_camel_cased_counts() {
    let app = app_with(service_with_key());

    let response = invoke(&webview(&app), "list_convert_inputs", json!({ "paths": [] }))
        .expect("list_convert_inputs must succeed on empty sources");

    assert_eq!(response["subtitleCount"], 0);
}

/// `preview_conversion` deserializes the nested options object the frontend
/// sends — camel-cased, with an explicit `null` for "use the configured
/// default" — and rejects a scan that found nothing convertible.
// @covers convert-workflow/multi-source-selection-with-scan-preview#no-convertible-subtitles-block-progress
#[test]
fn preview_conversion_deserializes_its_options_and_rejects_empty_sources() {
    let app = app_with(service_with_key());

    let error = invoke(
        &webview(&app),
        "preview_conversion",
        json!({ "paths": [], "options": { "targetFormat": null, "keepOriginal": true } }),
    )
    .expect_err("sources holding no subtitles must be rejected");

    assert_eq!(error["code"], "convert.no_subtitles");
    assert_eq!(error["hintCode"], "convert.no_subtitles.hint");
}

/// `cancel_conversion` reaches the webview and resolves with no payload even
/// when nothing is running — cancelling twice must be harmless.
#[test]
fn cancel_conversion_answers_over_ipc() {
    let app = app_with(service_with_key());

    let response =
        invoke(&webview(&app), "cancel_conversion", json!({})).expect("cancel must succeed");

    assert_eq!(response, Value::Null);
}

/// `get_sync_defaults` crosses the boundary with the camel-cased shape Step 2
/// reads, offsets in milliseconds and the method as its serialized variant.
// @covers sync-workflow/method-selection-seeded-from-shared-configuration#defaults-come-from-the-shared-configuration
#[test]
fn get_sync_defaults_answers_over_ipc_with_camel_cased_fields() {
    let app = app_with(service_with_key());

    let response =
        invoke(&webview(&app), "get_sync_defaults", json!({})).expect("the defaults must be read");

    assert_eq!(response["defaultMethod"], "auto");
    assert!(response["vadSensitivity"].is_number(), "{response}");
    assert!(response["maxOffsetMs"].is_number(), "{response}");
}

/// `apply_sync_offset` deserializes its camel-cased arguments — including the
/// explicit `null` output path that means "use the default `_synced` name" —
/// and crosses back an `ErrorDto` for a subtitle that is not there.
#[test]
fn apply_sync_offset_deserializes_its_arguments_over_ipc() {
    let app = app_with(service_with_key());

    let error = invoke(
        &webview(&app),
        "apply_sync_offset",
        json!({
            "subtitlePath": "/does/not/exist.srt",
            "offsetMs": 1000,
            "outputPath": null,
            "overwrite": false,
        }),
    )
    .expect_err("a missing subtitle must be rejected");

    // The arguments were accepted — the failure is the crate's, reported through
    // the shared `core.*` mapping rather than a deserialization complaint.
    assert!(
        error["code"].as_str().is_some_and(|code| code.starts_with("core.")),
        "the arguments must deserialize before the crate reports the real failure: {error}"
    );
}

/// `cancel_sync_detection` reaches the webview and resolves with no payload
/// even when nothing is running — cancelling twice must be harmless.
#[test]
fn cancel_sync_detection_answers_over_ipc() {
    let app = app_with(service_with_key());

    let response =
        invoke(&webview(&app), "cancel_sync_detection", json!({})).expect("cancel must succeed");

    assert_eq!(response, Value::Null);
}

/// `detect_sync_offset` deserializes its camel-cased pair and its optional
/// per-run sensitivity, and reports a failure as an `ErrorDto`.
#[test]
fn detect_sync_offset_deserializes_its_arguments_over_ipc() {
    let app = app_with(service_with_key());

    let error = invoke(
        &webview(&app),
        "detect_sync_offset",
        json!({
            "mediaPath": "/does/not/exist.mkv",
            "subtitlePath": "/does/not/exist.srt",
            "sensitivity": 75,
        }),
    )
    .expect_err("a missing pair must be rejected");

    assert!(
        error["code"].is_string(),
        "the arguments must deserialize before the real failure is reported: {error}"
    );
}

/// An unregistered command must be rejected, which is what makes the
/// registrations above meaningful.
#[test]
fn an_unregistered_command_is_not_reachable() {
    let app = app_with(service_with_key());

    let error = invoke(&webview(&app), "no_such_command", json!({}))
        .expect_err("an unregistered command must not resolve");

    assert!(
        error.to_string().contains("no_such_command"),
        "the rejection should name the command: {error}"
    );
}
