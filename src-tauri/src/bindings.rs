//! The single declaration of the IPC surface.
//!
//! This module replaces the `tauri::generate_handler!` list that used to live
//! in `handlers.rs`. That macro registered commands for the running app while
//! `src/types/ipc.ts` separately described them for the frontend, and nothing
//! checked the two against each other. Here one [`Builder`] both supplies the
//! app's invoke handler and emits `src/types/bindings.ts`, so a command cannot
//! be registered without a binding or generated without being registered.
//!
//! It is deliberately *one* construction site. Two builders listing the same
//! commands would satisfy the letter of that claim while recreating the defect
//! it exists to remove, one level down — so [`specta_builder`] is the only
//! place a builder is built, and `no_second_registration_path` enforces it.
//!
//! Kept out of `lib.rs` (excluded from coverage as un-runnable bootstrap) for
//! the same reason the registration was before: this part *is* testable, and
//! `ipc_tests` builds a mock app from it.

use tauri::Runtime;
use tauri_specta::{collect_commands, collect_events, Builder, ErrorHandlingMode};

use crate::error::ErrorDto;

/// The commands and events the app exposes, in one declaration.
///
/// Generic over the runtime so the real app (`Wry`) and the mock runtime the
/// IPC tests drive both register from this exact list rather than from two
/// that happen to agree.
pub fn specta_builder<R: Runtime>() -> Builder<R> {
    Builder::<R>::new()
        .commands(collect_commands![
            crate::commands::system::ping,
            crate::commands::config::get_config,
            crate::commands::config::set_config_value,
            crate::commands::config::test_ai_connection,
            crate::commands::r#match::list_source_files,
            crate::commands::r#match::analyze_sources,
            crate::commands::r#match::cancel_analysis,
            crate::commands::r#match::execute_selected,
        ])
        // Still empty. The match wizard reports progress over a per-invocation
        // `tauri::ipc::Channel` (`MatchProgress`), not a `tauri_specta::Event`:
        // emitting an event needs a runtime-generic `AppHandle<R>`, and a
        // generic command cannot be registered in this one generic builder
        // (the macro cannot infer `R`). The collection stays wired for a future
        // event that a non-command site emits.
        .events(collect_events![])
        // Commands reject; they do not resolve with a tagged result. The
        // alternative (`ErrorHandlingMode::Result`) types the error in the
        // signature, which sounds strictly better, but its generated runtime
        // still rethrows anything that is `instanceof Error` — so every call
        // site would have to handle two error channels instead of one. The
        // frontend narrows a single rejection with `isErrorDto` instead.
        .error_handling(ErrorHandlingMode::Throw)
        // Unified serde mode: one type per DTO rather than a `_Serialize` /
        // `_Deserialize` pair leaking the generator's phases into frontend
        // imports. It is incompatible with `skip_serializing_if`, which is why
        // the DTOs no longer carry it and the wire now sends explicit nulls.
        .disable_serde_phases()
        // `Throw` keeps the rejection type out of the command signatures, so
        // nothing would otherwise force `ErrorDto` into the output. Exporting it
        // explicitly is what lets the hand-written `isErrorDto` guard be defined
        // against the *generated* type and break at compile time if it drifts.
        .typ::<ErrorDto>()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};

    use specta_typescript::Typescript;

    use super::*;

    /// Where the generated contract is committed, relative to this crate.
    const OUTPUT: &str = "../src/types/bindings.ts";

    /// The committed contract, embedded at compile time.
    ///
    /// Reading it at runtime would race `export_bindings`, which rewrites the
    /// same path; embedding it also means a stale file is caught even when the
    /// gate is run without git.
    const COMMITTED: &str = include_str!("../../src/types/bindings.ts");

    fn crate_src() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
    }

    fn rust_sources(dir: &Path) -> Vec<PathBuf> {
        let mut found = Vec::new();
        for entry in fs::read_dir(dir).expect("the source tree must be readable") {
            let path = entry.expect("a readable directory entry").path();
            if path.is_dir() {
                found.extend(rust_sources(&path));
            } else if path.extension().is_some_and(|ext| ext == "rs") {
                found.push(path);
            }
        }
        found
    }

    /// Strips comments so prose that *names* the macro — this module's own docs
    /// explain why it is gone — is not mistaken for a call to it. Only code is
    /// evidence of a second registration path.
    fn code_only(source: &str) -> String {
        let mut out = String::with_capacity(source.len());
        let mut rest = source;
        while let Some(start) = rest.find("/*").into_iter().chain(rest.find("//")).min() {
            out.push_str(&rest[..start]);
            if rest[start..].starts_with("/*") {
                let end = rest[start..]
                    .find("*/")
                    .map(|i| start + i + 2)
                    .unwrap_or(rest.len());
                rest = &rest[end..];
            } else {
                let end = rest[start..]
                    .find('\n')
                    .map(|i| start + i)
                    .unwrap_or(rest.len());
                rest = &rest[end..];
            }
        }
        out.push_str(rest);
        out
    }

    /// True when `source` registers commands with the macro this change removed.
    ///
    /// The needle is assembled at runtime so this file does not match itself.
    fn registers_by_macro(source: &str) -> bool {
        code_only(source).contains(concat!("generate_", "handler!"))
    }

    /// How many command lists `source` declares.
    ///
    /// Counts the collection call rather than the `Builder` construction: a
    /// builder with no commands registers nothing, and matching the call makes
    /// this independent of how the builder's type is spelled.
    fn command_lists_in(source: &str) -> usize {
        code_only(source)
            .matches(concat!(".commands(collect_", "commands!"))
            .count()
    }

    fn export_to(path: &Path) {
        specta_builder::<tauri::Wry>()
            .export(Typescript::default(), path)
            .expect("the bindings must export");
    }

    /// Writes the committed bindings. The drift gate runs this and then checks
    /// `git diff`, which is what makes the generated file a reviewable artifact
    /// rather than a build side effect.
    #[test]
    fn export_bindings() {
        export_to(Path::new(OUTPUT));
    }

    // @covers typed-ipc/generated-bindings-are-committed-and-protected-against-drift#regeneration-is-deterministic
    #[test]
    fn two_generations_are_byte_identical() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let first = dir.path().join("first.ts");
        let second = dir.path().join("second.ts");

        export_to(&first);
        export_to(&second);

        assert_eq!(
            fs::read(&first).expect("the first export"),
            fs::read(&second).expect("the second export"),
            "generation must be deterministic or the git-diff drift gate flaps"
        );
    }

    /// A timestamp or tool-version banner would make every regeneration a diff,
    /// which is the one thing a `git diff` gate cannot tolerate.
    // @covers typed-ipc/generated-bindings-are-committed-and-protected-against-drift#regeneration-is-deterministic
    #[test]
    fn the_generated_file_carries_no_timestamp_or_version_banner() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("bindings.ts");
        export_to(&path);

        let output = fs::read_to_string(&path).expect("the export");
        assert!(
            !output.contains(env!("CARGO_PKG_VERSION")),
            "a version banner would churn the diff on every release: {output}"
        );
        for marker in ["Generated on", "Generated at", "timestamp", "Timestamp"] {
            assert!(
                !output.contains(marker),
                "the generated file must carry no `{marker}`: {output}"
            );
        }
    }

    /// The drift gate itself, minus git: what the current Rust definitions
    /// produce must be what is committed.
    // @covers typed-ipc/generated-bindings-are-committed-and-protected-against-drift#stale-committed-bindings-fail-the-gate
    #[test]
    fn the_committed_bindings_match_the_current_definitions() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("bindings.ts");
        export_to(&path);

        assert_eq!(
            fs::read_to_string(&path).expect("the export"),
            COMMITTED,
            "src/types/bindings.ts is stale; run `npm run bindings:generate`"
        );
    }

    /// An equality check that cannot tell the two apart would pass forever. This
    /// is the gate being watched to fail, kept as a test rather than as a note
    /// that someone once checked it by hand.
    // @covers typed-ipc/generated-bindings-are-committed-and-protected-against-drift#stale-committed-bindings-fail-the-gate
    #[test]
    fn a_stale_committed_file_is_detected() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("bindings.ts");
        export_to(&path);
        let generated = fs::read_to_string(&path).expect("the export");

        // Exactly the shape a renamed DTO field would produce.
        let stale = COMMITTED.replace("apiKeyMasked", "apiKeyObscured");
        assert_ne!(
            stale, COMMITTED,
            "the mutation must actually change the file, or this proves nothing"
        );
        assert_ne!(
            generated, stale,
            "the comparison must reject a committed file that no longer matches"
        );
    }

    /// Generation behaviour is asserted against fixtures rather than against
    /// the app's own DTOs, so these tests state what the generator does instead
    /// of restating what today's types happen to look like.
    mod generation {
        use serde::{Deserialize, Serialize};
        use specta::Type;
        use tauri_specta::Event;

        use super::*;

        #[derive(Serialize, Type)]
        #[serde(rename_all = "camelCase")]
        struct Fixture {
            probe_field: String,
        }

        #[derive(Serialize, Type)]
        #[serde(rename_all = "camelCase")]
        struct RenamedFixture {
            renamed_probe_field: String,
        }

        #[derive(Clone, Serialize, Deserialize, Type, Event)]
        struct FixtureEvent {
            stage: String,
        }

        /// Exports an arbitrary builder and hands back the TypeScript.
        fn generated(builder: Builder<tauri::Wry>) -> String {
            let dir = tempfile::tempdir().expect("a temp dir");
            let path = dir.path().join("fixture.ts");
            builder
                .export(Typescript::default(), &path)
                .expect("the fixture must export");
            fs::read_to_string(&path).expect("the fixture export")
        }

        // @covers typed-ipc/the-typescript-ipc-contract-is-generated-from-the-rust-definitions#a-renamed-backend-field-changes-the-generated-contract
        #[test]
        fn renaming_a_field_changes_the_generated_declaration() {
            let before = generated(Builder::<tauri::Wry>::new().typ::<Fixture>());
            let after = generated(Builder::<tauri::Wry>::new().typ::<RenamedFixture>());

            assert!(before.contains("probeField"), "{before}");
            assert!(
                !after.contains("probeField:"),
                "the old field must not survive the rename: {after}"
            );
            assert!(after.contains("renamedProbeField"), "{after}");
        }

        /// The declaration must carry the *serialized* name. Re-deriving the
        /// casing on the TypeScript side is what the hand-written mirror did,
        /// and it is what silently disagrees the moment a field opts out.
        // @covers typed-ipc/the-typescript-ipc-contract-is-generated-from-the-rust-definitions#serialization-renaming-is-reflected-not-re-derived
        #[test]
        fn the_serialized_name_is_what_is_declared() {
            let output = generated(Builder::<tauri::Wry>::new().typ::<Fixture>());

            assert!(output.contains("probeField"), "{output}");
            assert!(
                !output.contains("probe_field"),
                "the Rust field name must not reach TypeScript: {output}"
            );
        }

        /// Declaring an event is all it takes, because the collection is
        /// already wired — which is the point of wiring it while empty.
        // @covers typed-ipc/events-are-typed-by-the-same-mechanism#the-event-mechanism-is-wired-before-it-is-needed
        #[test]
        fn declaring_an_event_is_enough_to_generate_it() {
            let without = generated(specta_builder::<tauri::Wry>());
            assert!(
                !without.contains("FixtureEvent"),
                "the empty collection must generate no events: {without}"
            );

            let with = generated(
                Builder::<tauri::Wry>::new().events(tauri_specta::collect_events![FixtureEvent]),
            );
            assert!(
                with.contains("FixtureEvent"),
                "an event must reach the bindings by being declared: {with}"
            );
        }
    }

    /// Both halves of "reachable only once declared": every declared command
    /// reaches the generated contract, and `ipc_tests` proves the same list is
    /// what the runtime will answer to.
    // @covers typed-ipc/command-signatures-come-from-the-same-source-as-the-handler-registration#a-new-command-is-reachable-only-once-it-is-declared
    #[test]
    fn every_declared_command_appears_in_the_generated_contract() {
        for command in [
            "ping",
            "getConfig",
            "setConfigValue",
            "testAiConnection",
            "listSourceFiles",
            "analyzeSources",
            "cancelAnalysis",
            "executeSelected",
        ] {
            assert!(
                COMMITTED.contains(&format!("{command}:")),
                "the declared command `{command}` is missing from the bindings"
            );
        }
    }

    /// `Throw` mode puts no error into the command signatures, so nothing would
    /// pull `ErrorDto` into the output on its own — the builder exports it
    /// deliberately, and this is what notices if that line is dropped.
    // @covers typed-ipc/command-signatures-come-from-the-same-source-as-the-handler-registration#the-error-type-is-part-of-the-contract
    #[test]
    fn the_error_dto_is_part_of_the_generated_contract() {
        assert!(
            COMMITTED.contains("export type ErrorDto = {"),
            "the frontend guard has nothing to be defined against"
        );
        for field in ["code:", "message:", "hintCode:"] {
            assert!(COMMITTED.contains(field), "ErrorDto must declare `{field}`");
        }
    }

    /// D3's claim is "one declaration", and the way that claim decays is a
    /// second command list added elsewhere — `add-match-wizard` adds four
    /// commands, and every Tauri tutorial says to register them with the macro.
    // @covers typed-ipc/command-signatures-come-from-the-same-source-as-the-handler-registration#there-is-no-second-registration-path
    #[test]
    fn there_is_no_second_registration_path() {
        let mut declarations = Vec::new();
        for path in rust_sources(&crate_src()) {
            let source = fs::read_to_string(&path).expect("a readable source file");
            let name = path.display().to_string();

            assert!(
                !registers_by_macro(&source),
                "{name} registers commands with the macro; the builder is the only declaration"
            );

            for _ in 0..command_lists_in(&source) {
                declarations.push(name.clone());
            }
        }

        assert_eq!(
            declarations,
            vec![crate_src().join("bindings.rs").display().to_string()],
            "exactly one command list may exist, and it belongs in bindings.rs"
        );
    }

    /// The detector above, proven against the shapes it has to catch.
    ///
    /// A guard nobody has watched fail is a guard nobody should trust — and this
    /// one has already been wrong once: it looked for `Builder::<R>::new()` and
    /// so would have waved through the concretely-typed builder a feature module
    /// is far more likely to write.
    #[test]
    fn the_second_path_detector_catches_what_it_is_for() {
        // Assembled at runtime for the same reason the needles are: a fixture
        // spelling either construct literally would trip the real scan above.
        let list = format!(".commands(collect_{}![foo])", "commands");
        let macro_call = format!("tauri::generate_{}![ping]", "handler");

        // However the builder is spelled, the command list is what is counted.
        assert_eq!(
            command_lists_in(&format!("let b = Builder::<Wry>::new(){list};")),
            1,
            "a concretely-typed builder must not slip through"
        );
        assert_eq!(
            command_lists_in(&format!("let b: Builder<Wry> = Builder::new();\nb{list};")),
            1,
            "nor an inferred one"
        );
        assert_eq!(
            command_lists_in(&format!("Builder::<R>::new(){list}")),
            1,
            "generic over the runtime"
        );
        assert_eq!(
            command_lists_in("Builder::<Wry>::new()"),
            0,
            "a builder with no commands registers nothing"
        );

        // Prose naming either construct is not evidence of one.
        assert_eq!(command_lists_in(&format!("// we used to call {list}")), 0);
        assert!(!registers_by_macro(&format!("/// replaced {macro_call}")));
        assert!(registers_by_macro(&macro_call));
    }
}
