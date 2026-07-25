//! Path identity as the filesystem resolves it.
//!
//! Shared by every command module that has to answer "are these two paths the
//! same file?" before writing — which is a different question from `a == b`,
//! and getting it wrong destroys data rather than reporting an error.

use std::path::Path;

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
}
