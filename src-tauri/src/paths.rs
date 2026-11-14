//! Path identity as the filesystem resolves it.
//!
//! Shared by every command module that has to answer "are these two paths the
//! same file?" before writing — which is a different question from `a == b`,
//! and getting it wrong destroys data rather than reporting an error.

use std::path::{Component, Path};

use crate::error::ErrorDto;

/// The identity of a path *as the filesystem will resolve it*.
///
/// macOS and Windows treat `A.vtt` and `a.vtt` as one file. Comparing raw paths
/// there misses two hazards that both end in a lost file:
///
/// - in `commands::convert`, two plan items whose outputs differ only in case
///   would each believe they own the file and the second would silently
///   overwrite the first; and a same-format input like `show.SRT` would resolve
///   to a "different" output `show.srt` that is really itself, so with
///   keep-original off the run would delete the file it had just written;
/// - in `commands::sync`, an output typed as `movie.srt` for an input named
///   `Movie.srt` would slip past the "never modified in place" guard and, once
///   the user confirmed the overwrite the existence check then asks for, shift
///   the original on top of itself.
///
/// Linux stays byte-exact on purpose: `A.vtt` and `a.vtt` are genuinely two
/// files there, and folding would refuse an operation the user can perform.
///
/// This is deliberately *not* canonicalization. `Path::canonicalize` requires
/// the path to exist, and the interesting operand here is an output path that
/// usually does not yet.
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn path_key(path: &Path) -> String {
    path.to_string_lossy().to_lowercase()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn path_key(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Stable code for a write refused because it would land directly inside a
/// document-portal document directory.
pub const CODE_PORTAL_DOCUMENT_TARGET: &str = "path.portal_document_target";
pub const HINT_PORTAL_DOCUMENT_TARGET: &str = "path.portal_document_target.hint";

/// Answers "must a write to this path be refused?". A function pointer so the
/// preview commands can be tested with a substitute: a real portal path cannot
/// be created inside a test's temporary directory.
pub type WriteGuard = fn(&Path) -> bool;

/// True when `path` names an entry directly inside an xdg document-portal
/// document directory: `/run/user/<uid>/doc/<doc-id>/<name>`, or the
/// per-application view `/run/user/<uid>/doc/by-app/<app-id>/<doc-id>/<name>`.
///
/// For a single-file document that directory holds exactly the one granted
/// file. Any other name created or renamed-to there is backed by a hidden
/// `.xdp-<name>-XXXXXX` host file that the portal may later unlink, while the
/// call reports success. Paths one level deeper belong to a directory
/// document, where writes are real, and are not matched.
///
/// Purely lexical on purpose: the interesting operand is an output path that
/// does not exist yet, and the answer must not depend on a FUSE mount being
/// reachable.
pub fn is_portal_document_entry(path: &Path) -> bool {
    let mut owned: Vec<String> = Vec::new();
    let mut rooted = false;
    for component in path.components() {
        match component {
            Component::RootDir => rooted = true,
            Component::Normal(part) => owned.push(part.to_string_lossy().into_owned()),
            // `..`, a leading `.`, or a Windows prefix: never a portal path.
            _ => return false,
        }
    }
    if !rooted {
        return false;
    }
    let parts: Vec<&str> = owned.iter().map(String::as_str).collect();
    let is_uid = |part: &str| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit());
    match parts.as_slice() {
        ["run", "user", uid, "doc", rest @ ..] if is_uid(uid) => match rest {
            ["by-app", _app_id, _doc_id, _name] => true,
            [doc_id, _name] => *doc_id != "by-app",
            _ => false,
        },
        _ => false,
    }
}

/// The refusal every workflow reports for such a target.
pub fn portal_document_target(target: &Path) -> ErrorDto {
    ErrorDto::new(
        CODE_PORTAL_DOCUMENT_TARGET,
        format!(
            "refusing to write {}: a new file directly inside a document-portal document is not stored under its own name",
            target.display()
        ),
    )
    .with_hint(HINT_PORTAL_DOCUMENT_TARGET)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The rule every caller rests on, stated per platform so a change to
    /// either branch has to face this test.
    #[test]
    fn a_path_key_folds_case_exactly_where_the_filesystem_does() {
        let upper = Path::new("/media/Episode.VTT");
        let lower = Path::new("/media/episode.vtt");

        if cfg!(any(target_os = "macos", target_os = "windows")) {
            assert_eq!(
                path_key(upper),
                path_key(lower),
                "one file on a case-insensitive filesystem must be one key"
            );
        } else {
            assert_ne!(
                path_key(upper),
                path_key(lower),
                "two files on a case-sensitive filesystem must stay two keys"
            );
        }
    }

    /// Two different files stay different keys on every platform — otherwise
    /// the folding above would refuse legitimate work.
    #[test]
    fn distinct_paths_never_collapse() {
        assert_ne!(
            path_key(Path::new("/media/one.srt")),
            path_key(Path::new("/media/two.srt"))
        );
    }

    // @covers portal-path-safety/portal-document-entries-are-recognized-from-the-path-alone#a-file-directly-inside-a-document-directory-is-an-entry
    #[test]
    fn a_file_directly_inside_a_document_directory_is_an_entry() {
        assert!(is_portal_document_entry(Path::new(
            "/run/user/1000/doc/a1b2c3d4/movie.tc.ass"
        )));
    }

    // @covers portal-path-safety/portal-document-entries-are-recognized-from-the-path-alone#a-file-inside-a-directory-document-is-not-an-entry
    #[test]
    fn a_file_inside_a_directory_document_is_not_an_entry() {
        assert!(!is_portal_document_entry(Path::new(
            "/run/user/1000/doc/a1b2c3d4/Season 1/movie.ass"
        )));
    }

    // @covers portal-path-safety/portal-document-entries-are-recognized-from-the-path-alone#the-per-application-view-is-recognized
    #[test]
    fn the_per_application_view_is_recognized() {
        assert!(is_portal_document_entry(Path::new(
            "/run/user/1000/doc/by-app/im.chenj.subx/a1b2c3d4/movie.ass"
        )));
        assert!(!is_portal_document_entry(Path::new(
            "/run/user/1000/doc/by-app/im.chenj.subx/a1b2c3d4/Season 1/movie.ass"
        )));
    }

    // @covers portal-path-safety/portal-document-entries-are-recognized-from-the-path-alone#ordinary-and-malformed-paths-are-not-entries
    #[test]
    fn ordinary_and_malformed_paths_are_not_entries() {
        for path in [
            "/home/user/doc/a1b2c3d4/movie.ass",
            "/run/user/1000/gvfs/share/movie.ass",
            "/run/user/abc/doc/a1b2c3d4/movie.ass",
            "/run/user/1000/doc/a1b2c3d4",
            "run/user/1000/doc/a1b2c3d4/movie.ass",
            "/run/user/1000/doc/a1b2c3d4/../x/movie.ass",
        ] {
            assert!(
                !is_portal_document_entry(Path::new(path)),
                "{path} must not classify as a portal document entry"
            );
        }
    }

    #[test]
    fn the_portal_refusal_names_the_code_the_hint_and_the_path() {
        let target = Path::new("/run/user/1000/doc/a1b2c3d4/v.srt");
        let error = portal_document_target(target);

        assert_eq!(error.code, CODE_PORTAL_DOCUMENT_TARGET);
        assert_eq!(
            error.hint_code.as_deref(),
            Some(HINT_PORTAL_DOCUMENT_TARGET)
        );
        assert!(
            error.message.contains(&target.display().to_string()),
            "the message must name the refused path: {}",
            error.message
        );
    }
}
