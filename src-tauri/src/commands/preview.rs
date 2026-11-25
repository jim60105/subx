//! Sync preview commands: the subtitle's cues and the media's loopback URL.
//!
//! The preview plays the selected media with the subtitle drawn over it, so
//! the frontend needs the cue times and a seekable URL. Cues come from the very
//! loader applying an offset uses, so the preview shows what apply will shift;
//! the URL comes from [`crate::media_server`] through [`PreviewState`].

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use subx_core::core::formats::Subtitle;
use tauri::State;

use subx_core::error::SubXError;

use crate::audio_fallback::{self, AudioFallbackError};
use crate::commands::sync::load_subtitle;
use crate::dto::{PreviewAudioDto, PreviewCueDto, PreviewSessionDto};
use crate::error::ErrorDto;
use crate::state::{AppState, AudioStart, PreviewState};

/// The media is not a readable regular file.
pub(crate) const CODE_MEDIA_UNREADABLE: &str = "preview.media_unreadable";
/// The loopback server could not start or publish.
pub(crate) const CODE_SERVER_UNAVAILABLE: &str = "preview.server_unavailable";
/// The media has no audio the fallback can decode, or its WAV would be too large.
pub(crate) const CODE_AUDIO_UNSUPPORTED: &str = "preview.audio_unsupported";
/// The session is not open, its audio is already being prepared, or the job
/// was cancelled or superseded.
pub(crate) const CODE_CANCELLED: &str = "preview.cancelled";

// ─── Command wrappers ───────────────────────────────────────────────────────

/// The subtitle's cues in file order, read by the loader apply uses.
#[tauri::command]
#[specta::specta]
pub async fn load_preview_cues(subtitle_path: String) -> Result<Vec<PreviewCueDto>, ErrorDto> {
    load_preview_cues_impl(PathBuf::from(subtitle_path)).await
}

/// Publishes the media and returns the one open session, replacing any other.
#[tauri::command]
#[specta::specta]
pub async fn open_preview(
    media_path: String,
    state: State<'_, AppState>,
) -> Result<PreviewSessionDto, ErrorDto> {
    open_preview_impl(state.preview_state(), PathBuf::from(media_path)).await
}

/// Revokes the session's URL; a stale or repeated id is ignored.
#[tauri::command]
#[specta::specta]
pub async fn close_preview(session_id: String, state: State<'_, AppState>) -> Result<(), ErrorDto> {
    state.preview_state().close(&session_id);
    Ok(())
}

/// Decodes the open session's audio to a WAV and returns its loopback URL.
#[tauri::command]
#[specta::specta]
pub async fn prepare_preview_audio(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<PreviewAudioDto, ErrorDto> {
    prepare_preview_audio_impl(state.preview_state(), session_id).await
}

/// Gives the session's audio up without closing the session; idempotent.
#[tauri::command]
#[specta::specta]
pub async fn release_preview_audio(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), ErrorDto> {
    state.preview_state().release_audio(&session_id);
    Ok(())
}

// ─── Implementations ────────────────────────────────────────────────────────

/// Decoding reads the whole container and writes a temporary file, so it runs
/// on the blocking pool; the session's slot decides whether its result is
/// still wanted (design D3, D4).
async fn prepare_preview_audio_impl(
    state: Arc<PreviewState>,
    session_id: String,
) -> Result<PreviewAudioDto, ErrorDto> {
    let (media, cancel) = match state.begin_audio(&session_id)? {
        AudioStart::Ready(url) => return Ok(PreviewAudioDto { url }),
        AudioStart::Start { media, cancel } => (media, cancel),
    };
    let job = Arc::clone(&cancel);
    let outcome = tokio::task::spawn_blocking(move || audio_fallback::decode_to_wav(&media, &job))
        .await
        .unwrap_or_else(|_| {
            Err(AudioFallbackError::Unsupported(
                "the decoding task panicked".to_string(),
            ))
        });
    let url = state.finish_audio(&session_id, &cancel, outcome)?;
    Ok(PreviewAudioDto { url })
}

/// The error code of a failed audio preparation (design D2).
pub(crate) fn audio_error(err: AudioFallbackError) -> ErrorDto {
    match err {
        AudioFallbackError::Unsupported(detail) => ErrorDto::new(CODE_AUDIO_UNSUPPORTED, detail),
        AudioFallbackError::Unreadable(detail) => ErrorDto::new(CODE_MEDIA_UNREADABLE, detail),
        AudioFallbackError::Cancelled => {
            ErrorDto::new(CODE_CANCELLED, "the audio preparation was cancelled")
        }
        AudioFallbackError::Io(err) => ErrorDto::from(SubXError::from(err)),
    }
}

/// `FormatManager` is neither `Send` nor `Sync` and parsing touches the disk,
/// so the loader runs on the blocking pool.
async fn load_preview_cues_impl(path: PathBuf) -> Result<Vec<PreviewCueDto>, ErrorDto> {
    let subtitle = tokio::task::spawn_blocking(move || load_subtitle(&path))
        .await
        .map_err(|_| panicked("the cue loading task panicked"))??;
    Ok(cues_of(&subtitle))
}

/// Metadata on a network mount can block, so the check runs on the blocking
/// pool; its threads keep the runtime context the server needs to start.
async fn open_preview_impl(
    state: Arc<PreviewState>,
    media: PathBuf,
) -> Result<PreviewSessionDto, ErrorDto> {
    tokio::task::spawn_blocking(move || state.open(media))
        .await
        .map_err(|_| panicked("the preview opening task panicked"))?
}

fn cues_of(subtitle: &Subtitle) -> Vec<PreviewCueDto> {
    subtitle
        .entries
        .iter()
        .map(|entry| PreviewCueDto {
            start_ms: whole_ms(entry.start_time),
            end_ms: whole_ms(entry.end_time),
            text: entry.text.clone(),
        })
        .collect()
}

fn whole_ms(time: Duration) -> u32 {
    u32::try_from(time.as_millis()).unwrap_or(u32::MAX)
}

fn panicked(detail: &str) -> ErrorDto {
    ErrorDto::new("core.other", detail)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use super::*;
    use crate::media_server::test_http;

    /// The second cue starts before the first, so a loader that sorted would
    /// be caught.
    const OUT_OF_ORDER_SRT: &str = "1\n00:00:05,250 --> 00:00:06,500\nSecond in time\n\n2\n00:00:01,000 --> 00:00:02,125\nFirst in time\n\n";

    fn write(dir: &Path, name: &str, content: &[u8]) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, content).expect("write");
        path
    }

    // @covers sync-workflow/preview-cues-come-from-the-apply-loader#cues-are-returned-in-file-order
    #[tokio::test]
    async fn cues_are_returned_in_file_order() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = write(dir.path(), "a.srt", OUT_OF_ORDER_SRT.as_bytes());

        let cues = load_preview_cues_impl(path.clone()).await.expect("cues");

        let loaded = load_subtitle(&path).expect("the apply loader reads it");
        assert_eq!(cues.len(), loaded.entries.len());
        for (cue, entry) in cues.iter().zip(&loaded.entries) {
            assert_eq!(u128::from(cue.start_ms), entry.start_time.as_millis());
            assert_eq!(u128::from(cue.end_ms), entry.end_time.as_millis());
            assert_eq!(cue.text, entry.text);
        }
        assert_eq!(
            cues.iter()
                .map(|cue| (cue.start_ms, cue.end_ms))
                .collect::<Vec<_>>(),
            vec![(5250, 6500), (1000, 2125)],
            "file order, not time order"
        );
        assert_eq!(cues[0].text, "Second in time");
    }

    // @covers sync-workflow/preview-cues-come-from-the-apply-loader#unparsable-subtitle-reports-the-loader-error
    #[tokio::test]
    async fn unparsable_subtitle_reports_the_loader_error() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = write(dir.path(), "a.srt", b"\x00\x01 this is not a subtitle \xff");

        let error = load_preview_cues_impl(path.clone())
            .await
            .expect_err("not a subtitle");

        let apply_error = load_subtitle(&path).expect_err("the apply loader refuses it too");
        assert_eq!(error.code, apply_error.code);
        assert!(error.code.starts_with("core."), "{}", error.code);
    }

    #[test]
    fn times_saturate_at_the_u32_limit() {
        assert_eq!(whole_ms(Duration::from_micros(1_999)), 1);
        assert_eq!(whole_ms(Duration::from_secs(u64::from(u32::MAX))), u32::MAX);
    }

    async fn status_of(url: &str) -> u16 {
        test_http::get(url)
            .await
            .expect("the server answers")
            .status
    }

    // @covers sync-workflow/at-most-one-preview-session-is-open#opening-replaces-the-previous-session
    #[tokio::test(flavor = "multi_thread")]
    async fn opening_replaces_the_previous_session() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = Arc::new(PreviewState::default());
        let first = open_preview_impl(state.clone(), write(dir.path(), "a.mp4", b"first"))
            .await
            .expect("open");
        let second = open_preview_impl(state.clone(), write(dir.path(), "b.mp4", b"second"))
            .await
            .expect("open");

        assert_eq!(status_of(&first.url).await, 404);
        let reply = test_http::get(&second.url).await.expect("answers");
        assert_eq!(reply.status, 200);
        assert_eq!(reply.body, b"second");
    }

    // @covers sync-workflow/at-most-one-preview-session-is-open#stale-close-is-ignored
    #[tokio::test(flavor = "multi_thread")]
    async fn stale_close_is_ignored() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = Arc::new(PreviewState::default());
        let first = open_preview_impl(state.clone(), write(dir.path(), "a.mp4", b"first"))
            .await
            .expect("open");
        let second = open_preview_impl(state.clone(), write(dir.path(), "b.mp4", b"second"))
            .await
            .expect("open");

        state.close(&first.session_id);

        assert_eq!(status_of(&second.url).await, 200);
    }

    // @covers sync-workflow/at-most-one-preview-session-is-open#closing-is-idempotent
    #[tokio::test(flavor = "multi_thread")]
    async fn closing_is_idempotent() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = Arc::new(PreviewState::default());
        let session = open_preview_impl(state.clone(), write(dir.path(), "a.mp4", b"media"))
            .await
            .expect("open");
        assert_eq!(status_of(&session.url).await, 200);

        state.close(&session.session_id);
        state.close(&session.session_id);

        assert_eq!(status_of(&session.url).await, 404);
    }

    // @covers sync-workflow/at-most-one-preview-session-is-open#unreadable-media-is-reported
    #[tokio::test(flavor = "multi_thread")]
    async fn unreadable_media_is_reported() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = Arc::new(PreviewState::default());
        let open = open_preview_impl(state.clone(), write(dir.path(), "a.mp4", b"media"))
            .await
            .expect("open");

        for media in [dir.path().to_path_buf(), dir.path().join("missing.mp4")] {
            let error = open_preview_impl(state.clone(), media.clone())
                .await
                .expect_err("not a readable regular file");
            assert_eq!(error.code, CODE_MEDIA_UNREADABLE, "{}", media.display());
            assert_eq!(
                status_of(&open.url).await,
                200,
                "the open session stays open"
            );
        }
    }

    fn late_mkv() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/late.mkv")
    }

    // @covers sync-workflow/preview-audio-belongs-to-its-session#prepared-audio-is-served
    #[tokio::test(flavor = "multi_thread")]
    async fn prepared_audio_is_served() {
        let state = Arc::new(PreviewState::default());
        let session = open_preview_impl(state.clone(), late_mkv())
            .await
            .expect("open");

        let audio = prepare_preview_audio_impl(state.clone(), session.session_id.clone())
            .await
            .expect("prepared");

        let reply = test_http::get(&audio.url).await.expect("answers");
        assert_eq!(reply.status, 200);
        assert_eq!(reply.header("content-type"), Some("audio/wav"));
        assert_eq!(&reply.body[..4], b"RIFF");
        assert_eq!(&reply.body[8..12], b"WAVE");
        assert_eq!(status_of(&session.url).await, 200, "the media still works");

        let again = prepare_preview_audio_impl(state.clone(), session.session_id.clone())
            .await
            .expect("prepared again");
        assert_eq!(again.url, audio.url, "the same file is reused");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn undecodable_media_reports_unsupported_audio() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let state = Arc::new(PreviewState::default());
        let session = open_preview_impl(state.clone(), write(dir.path(), "a.mp4", b"not media"))
            .await
            .expect("open");

        let error = prepare_preview_audio_impl(state.clone(), session.session_id.clone())
            .await
            .expect_err("nothing to decode");

        assert_eq!(error.code, CODE_AUDIO_UNSUPPORTED);
        let stale = prepare_preview_audio_impl(state, "preview-0".to_string())
            .await
            .expect_err("not open");
        assert_eq!(stale.code, CODE_CANCELLED);
    }

    #[test]
    fn audio_errors_map_to_their_codes() {
        let cases = [
            (AudioFallbackError::Unsupported("x".into()), "preview.audio_unsupported"),
            (AudioFallbackError::Unreadable("x".into()), "preview.media_unreadable"),
            (AudioFallbackError::Cancelled, "preview.cancelled"),
            (
                AudioFallbackError::Io(std::io::Error::other("disk full")),
                "core.io",
            ),
        ];
        for (error, code) in cases {
            assert_eq!(audio_error(error).code, code);
        }
    }
}
