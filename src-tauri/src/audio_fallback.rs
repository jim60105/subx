//! The sync preview's audio fallback (design D2).
//!
//! When the WebView cannot play the selected media, the preview still needs its
//! sound. This decodes the media's audio into a mono 16-bit WAV at the source
//! rate, placed on the container's timeline by packet timestamp, with bounded
//! memory and a cancel flag checked between packets.
//!
//! The engine's own loader is not used: it concatenates samples and ignores
//! timestamps, so a track that starts late would play early.
//!
//! The output is an anonymous temporary file (`tempfile::tempfile_in`): it has
//! no name on Unix and is delete-on-close on Windows, so dropping its last
//! handle frees it and a crash leaves no named file behind.

use std::fs::File;
use std::io::{self, BufWriter, Seek, SeekFrom, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Timestamp jitter, in milliseconds, that neither inserts nor drops samples.
pub const JITTER_TOLERANCE_MS: u64 = 20;
/// The largest `data` chunk whose RIFF size (`36 + data`) still fits a `u32`.
pub const MAX_WAV_DATA_BYTES: u64 = (u32::MAX - 36) as u64;

/// Bytes in the canonical PCM WAV header this module writes.
const HEADER_BYTES: u64 = 44;
/// Silence is written in chunks of at most this many frames, with the cancel
/// flag checked before each one.
const SILENCE_CHUNK_FRAMES: u64 = 8192;
static SILENCE: [u8; (SILENCE_CHUNK_FRAMES * 2) as usize] = [0; (SILENCE_CHUNK_FRAMES * 2) as usize];

/// Why the audio could not be prepared. Mapped to error codes by
/// `commands::preview::audio_error`.
#[derive(Debug)]
pub enum AudioFallbackError {
    /// No decodable track, an unsupported stream feature, or a WAV that would
    /// exceed the format's size limit.
    Unsupported(String),
    /// The media could not be opened or read.
    Unreadable(String),
    /// Writing the WAV failed.
    Io(io::Error),
    /// The cancel flag was set.
    Cancelled,
}

impl From<io::Error> for AudioFallbackError {
    fn from(err: io::Error) -> Self {
        Self::Io(err)
    }
}

/// Decodes `media`'s audio into an unnamed temporary WAV in the system
/// temporary directory.
///
/// Blocking. The caller runs it in `spawn_blocking`.
pub fn decode_to_wav(media: &Path, cancel: &AtomicBool) -> Result<File, AudioFallbackError> {
    decode_into(media, cancel, &std::env::temp_dir())
}

/// [`decode_to_wav`] with the temporary directory injected, the seam that
/// proves the file has no name there.
fn decode_into(media: &Path, cancel: &AtomicBool, dir: &Path) -> Result<File, AudioFallbackError> {
    let out = decode_with(media, cancel, || tempfile::tempfile_in(dir).map(BufWriter::new))?;
    out.into_inner()
        .map_err(|err| AudioFallbackError::Io(err.into_error()))
}

/// The decoding itself, over any output. The output is only created once the
/// media has been probed and a decoder made, and it is dropped on every
/// failure, so no handle to a partial file survives one.
fn decode_with<W: Write + Seek>(
    media: &Path,
    cancel: &AtomicBool,
    make: impl FnOnce() -> io::Result<W>,
) -> Result<W, AudioFallbackError> {
    let source = File::open(media).map_err(|err| AudioFallbackError::Unreadable(err.to_string()))?;
    let stream = MediaSourceStream::new(Box::new(source), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = media.extension().and_then(|extension| extension.to_str()) {
        hint.with_extension(extension);
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|err| AudioFallbackError::Unsupported(err.to_string()))?;
    let mut format = probed.format;

    // The rule detection uses: the first track that declares a sample rate.
    let track = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.sample_rate.is_some())
        .ok_or_else(|| AudioFallbackError::Unsupported("no audio track".to_string()))?;
    let track_id = track.id;
    let rate = track.codec_params.sample_rate.expect("filtered above");
    let time_base = track.codec_params.time_base;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|err| AudioFallbackError::Unsupported(err.to_string()))?;

    let mut writer = TimelineWriter::new(make()?, rate, MAX_WAV_DATA_BYTES)?;
    let mut samples: Option<SampleBuffer<f32>> = None;
    let mut mono = Vec::new();
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(AudioFallbackError::Cancelled);
        }
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(err)) if err.kind() == io::ErrorKind::UnexpectedEof => {
                break
            }
            // A chained stream (a new logical Ogg stream, for instance) would
            // need the decoder rebuilt, which the fallback does not do.
            Err(SymphoniaError::ResetRequired) => {
                return Err(AudioFallbackError::Unsupported(
                    "the stream requires a decoder reset".to_string(),
                ))
            }
            Err(err) => return Err(AudioFallbackError::Unreadable(err.to_string())),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            // A corrupt packet is skipped; the next packet's timestamp turns
            // the hole into silence.
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(err) => return Err(AudioFallbackError::Unsupported(err.to_string())),
        };
        let spec = *decoded.spec();
        if spec.rate != rate {
            return Err(AudioFallbackError::Unsupported(format!(
                "the decoded rate {} differs from the track rate {rate}",
                spec.rate
            )));
        }
        let buffer = match &mut samples {
            Some(buffer) if buffer.capacity() >= decoded.capacity() * spec.channels.count() => {
                buffer
            }
            slot => slot.insert(SampleBuffer::new(decoded.capacity() as u64, spec)),
        };
        buffer.copy_interleaved_ref(decoded);
        downmix(buffer.samples(), spec.channels.count(), &mut mono);

        let start = match time_base {
            Some(time_base) => {
                let time = time_base.calc_time(packet.ts());
                time.seconds
                    .saturating_mul(u64::from(rate))
                    .saturating_add((time.frac * f64::from(rate)).round() as u64)
            }
            None => packet.ts(),
        };
        writer.push(start, &mono, cancel)?;
    }

    if writer.written_frames == 0 {
        return Err(AudioFallbackError::Unsupported(
            "the track decoded to no audio".to_string(),
        ));
    }
    Ok(writer.finish()?)
}

/// Averages interleaved channels into `mono` as 16-bit samples.
fn downmix(interleaved: &[f32], channels: usize, mono: &mut Vec<i16>) {
    mono.clear();
    let channels = channels.max(1);
    mono.extend(interleaved.chunks_exact(channels).map(|frame| {
        let average = frame.iter().sum::<f32>() / channels as f32;
        (average.clamp(-1.0, 1.0) * 32767.0).round() as i16
    }));
}

/// Writes mono 16-bit frames at their absolute positions.
struct TimelineWriter<W: Write + Seek> {
    out: W,
    tolerance_frames: u64,
    written_frames: u64,
    max_frames: u64,
}

impl<W: Write + Seek> TimelineWriter<W> {
    /// Writes a 44-byte header whose sizes [`Self::finish`] patches.
    fn new(mut out: W, rate: u32, max_data_bytes: u64) -> io::Result<Self> {
        let mut header = Vec::with_capacity(HEADER_BYTES as usize);
        header.extend_from_slice(b"RIFF");
        header.extend_from_slice(&36u32.to_le_bytes());
        header.extend_from_slice(b"WAVEfmt ");
        header.extend_from_slice(&16u32.to_le_bytes());
        header.extend_from_slice(&1u16.to_le_bytes()); // PCM
        header.extend_from_slice(&1u16.to_le_bytes()); // mono
        header.extend_from_slice(&rate.to_le_bytes());
        header.extend_from_slice(&rate.saturating_mul(2).to_le_bytes()); // byte rate
        header.extend_from_slice(&2u16.to_le_bytes()); // block align
        header.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
        header.extend_from_slice(b"data");
        header.extend_from_slice(&0u32.to_le_bytes());
        out.write_all(&header)?;
        Ok(Self {
            out,
            tolerance_frames: u64::from(rate) * JITTER_TOLERANCE_MS / 1000,
            written_frames: 0,
            max_frames: max_data_bytes / 2,
        })
    }

    /// Places `mono` at `start_frame`. A start later than the end written so
    /// far by more than the tolerance is preceded by silence; one earlier by
    /// more than the tolerance loses its overlapping frames; anything within it
    /// is appended contiguously. Each packet is compared against its absolute
    /// timestamp, so jitter never accumulates past the tolerance.
    fn push(
        &mut self,
        start_frame: u64,
        mono: &[i16],
        cancel: &AtomicBool,
    ) -> Result<(), AudioFallbackError> {
        let expected = self.written_frames;
        let length = mono.len() as u64;
        let (silence, skip) = if start_frame > expected.saturating_add(self.tolerance_frames) {
            (start_frame - expected, 0)
        } else if start_frame.saturating_add(self.tolerance_frames) < expected {
            (0, (expected - start_frame).min(length))
        } else {
            (0, 0)
        };
        let new = silence.saturating_add(length - skip);
        // Checked before anything is written, silence included, in frames so a
        // corrupt timestamp cannot overflow the comparison.
        if new > self.max_frames.saturating_sub(expected) {
            return Err(AudioFallbackError::Unsupported(
                "output exceeds the WAV size limit".to_string(),
            ));
        }

        let mut remaining = silence;
        while remaining > 0 {
            if cancel.load(Ordering::SeqCst) {
                return Err(AudioFallbackError::Cancelled);
            }
            let frames = remaining.min(SILENCE_CHUNK_FRAMES);
            self.out.write_all(&SILENCE[..(frames * 2) as usize])?;
            self.written_frames += frames;
            remaining -= frames;
        }
        let kept = &mono[skip as usize..];
        let mut bytes = Vec::with_capacity(kept.len() * 2);
        for sample in kept {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        self.out.write_all(&bytes)?;
        self.written_frames += kept.len() as u64;
        Ok(())
    }

    /// Patches both header sizes and flushes.
    fn finish(mut self) -> io::Result<W> {
        // Bounded by `max_frames`, so both fit a `u32`.
        let data = (self.written_frames * 2) as u32;
        self.out.seek(SeekFrom::Start(4))?;
        self.out.write_all(&(36 + data).to_le_bytes())?;
        self.out.seek(SeekFrom::Start(40))?;
        self.out.write_all(&data.to_le_bytes())?;
        self.out.seek(SeekFrom::End(0))?;
        self.out.flush()?;
        Ok(self.out)
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Read};
    use std::path::PathBuf;
    use std::sync::Arc;

    use super::*;

    const RATE: u32 = 8000;
    /// 160 frames at 8 kHz.
    const TOL: u64 = RATE as u64 * JITTER_TOLERANCE_MS / 1000;

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    fn writer() -> TimelineWriter<Cursor<Vec<u8>>> {
        TimelineWriter::new(Cursor::new(Vec::new()), RATE, MAX_WAV_DATA_BYTES).expect("header")
    }

    fn frames_of(bytes: &[u8]) -> Vec<i16> {
        bytes[HEADER_BYTES as usize..]
            .chunks_exact(2)
            .map(|pair| i16::from_le_bytes([pair[0], pair[1]]))
            .collect()
    }

    fn u32_at(bytes: &[u8], at: usize) -> u32 {
        u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap())
    }

    fn u16_at(bytes: &[u8], at: usize) -> u16 {
        u16::from_le_bytes(bytes[at..at + 2].try_into().unwrap())
    }

    fn no_cancel() -> AtomicBool {
        AtomicBool::new(false)
    }

    #[test]
    fn a_gap_becomes_silence_and_the_packet_keeps_its_timestamp() {
        let mut writer = writer();
        writer.push(0, &[1; 100], &no_cancel()).unwrap();
        writer.push(100 + TOL + 1, &[2; 10], &no_cancel()).unwrap();
        let bytes = writer.finish().unwrap().into_inner();

        let frames = frames_of(&bytes);
        assert_eq!(frames.len() as u64, 100 + TOL + 1 + 10);
        assert!(frames[..100].iter().all(|&sample| sample == 1));
        assert!(frames[100..(100 + TOL + 1) as usize]
            .iter()
            .all(|&sample| sample == 0));
        assert!(frames[(100 + TOL + 1) as usize..]
            .iter()
            .all(|&sample| sample == 2));
    }

    #[test]
    fn jitter_within_the_tolerance_is_absorbed() {
        let mut writer = writer();
        writer.push(0, &[1; 1000], &no_cancel()).unwrap();
        // Exactly at both edges of the tolerance, then a little either way.
        writer.push(1000 + TOL, &[2; 1000], &no_cancel()).unwrap();
        writer.push(2000 - TOL, &[3; 1000], &no_cancel()).unwrap();
        writer.push(3000 + 7, &[4; 1000], &no_cancel()).unwrap();
        writer.push(4000 - 7, &[5; 1000], &no_cancel()).unwrap();
        let bytes = writer.finish().unwrap().into_inner();

        let frames = frames_of(&bytes);
        assert_eq!(frames.len(), 5000, "nothing inserted, nothing dropped");
        for (index, chunk) in frames.chunks(1000).enumerate() {
            assert!(
                chunk.iter().all(|&sample| sample == index as i16 + 1),
                "packet {index} is contiguous"
            );
        }
    }

    #[test]
    fn an_overlap_beyond_the_tolerance_is_trimmed() {
        let mut writer = writer();
        writer.push(0, &[1; 1000], &no_cancel()).unwrap();
        let start = 1000 - TOL - 1;
        let packet: Vec<i16> = (0..500).collect();
        writer.push(start, &packet, &no_cancel()).unwrap();
        // Wholly inside what was written: dropped entirely.
        writer.push(0, &[9; 100], &no_cancel()).unwrap();
        let bytes = writer.finish().unwrap().into_inner();

        let frames = frames_of(&bytes);
        assert_eq!(frames.len() as u64, 1000 + 500 - (TOL + 1));
        assert!(frames[..1000].iter().all(|&sample| sample == 1));
        assert_eq!(frames[1000], (TOL + 1) as i16, "the overlapping frames are gone");
        assert_eq!(*frames.last().unwrap(), 499);
    }

    #[test]
    fn oversized_output_is_refused_before_writing_past_the_limit() {
        let max_data_bytes = 1000;
        let mut writer =
            TimelineWriter::new(Cursor::new(Vec::new()), RATE, max_data_bytes).unwrap();
        writer.push(0, &[1; 400], &no_cancel()).unwrap();
        let before = writer.out.get_ref().len();

        for (start, length) in [(400, 101), (400 + TOL + 1, 10), (u64::MAX, 1)] {
            match writer.push(start, &vec![1; length], &no_cancel()) {
                Err(AudioFallbackError::Unsupported(message)) => {
                    assert!(message.contains("size limit"), "{message}")
                }
                other => panic!("expected the size limit, got {other:?}"),
            }
            assert_eq!(writer.out.get_ref().len(), before, "nothing written");
        }
        assert!(before as u64 <= HEADER_BYTES + max_data_bytes);

        // Exactly at the limit is still allowed.
        writer.push(400, &[1; 100], &no_cancel()).unwrap();
        assert_eq!(writer.out.get_ref().len() as u64, HEADER_BYTES + max_data_bytes);
    }

    /// A writer whose writes fail, or that fails only when flushed.
    struct Failing {
        on_write: bool,
    }

    impl Write for Failing {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            if self.on_write {
                Err(io::Error::other("disk full"))
            } else {
                Ok(buf.len())
            }
        }
        fn flush(&mut self) -> io::Result<()> {
            Err(io::Error::other("flush failed"))
        }
    }

    impl Seek for Failing {
        fn seek(&mut self, _: SeekFrom) -> io::Result<u64> {
            Ok(0)
        }
    }

    #[test]
    fn a_write_failure_is_reported() {
        assert!(TimelineWriter::new(Failing { on_write: true }, RATE, 100).is_err());

        let mut writer = TimelineWriter::new(Failing { on_write: false }, RATE, 1000).unwrap();
        writer.out.on_write = true;
        assert!(matches!(
            writer.push(0, &[1; 10], &no_cancel()),
            Err(AudioFallbackError::Io(_))
        ));
        writer.out.on_write = false;
        assert!(writer.finish().is_err(), "a failed flush is reported");
    }

    #[test]
    fn cancellation_stops_silence_filling() {
        let mut writer = writer();
        let cancel = AtomicBool::new(true);
        assert!(matches!(
            writer.push(10 * SILENCE_CHUNK_FRAMES, &[1; 10], &cancel),
            Err(AudioFallbackError::Cancelled)
        ));
        assert_eq!(writer.out.get_ref().len() as u64, HEADER_BYTES);
    }

    // ─── decode ─────────────────────────────────────────────────────────────

    /// An output whose strong count shows whether a handle survived.
    struct Tracked {
        inner: Cursor<Vec<u8>>,
        _token: Arc<()>,
        cancel_on_write: Option<Arc<AtomicBool>>,
        fail_writes: bool,
    }

    impl Tracked {
        fn new(token: &Arc<()>) -> Self {
            Self {
                inner: Cursor::new(Vec::new()),
                _token: Arc::clone(token),
                cancel_on_write: None,
                fail_writes: false,
            }
        }
    }

    impl Write for Tracked {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            if self.fail_writes {
                return Err(io::Error::other("disk full"));
            }
            if let Some(cancel) = &self.cancel_on_write {
                cancel.store(true, Ordering::SeqCst);
            }
            self.inner.write(buf)
        }
        fn flush(&mut self) -> io::Result<()> {
            self.inner.flush()
        }
    }

    impl Seek for Tracked {
        fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
            self.inner.seek(pos)
        }
    }

    fn read_all(mut file: File) -> Vec<u8> {
        let mut bytes = Vec::new();
        file.seek(SeekFrom::Start(0)).unwrap();
        file.read_to_end(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn a_late_start_becomes_silence() {
        let file = decode_to_wav(&fixture("late.mkv"), &no_cancel()).expect("decoded");
        let bytes = read_all(file);

        assert_eq!(u32_at(&bytes, 4) as usize, bytes.len() - 8, "RIFF size");
        assert_eq!(u32_at(&bytes, 40) as usize, bytes.len() - 44, "data size");
        assert_eq!(u32_at(&bytes, 24), RATE);
        let frames = frames_of(&bytes);
        assert!(frames[..16000].iter().all(|&sample| sample == 0), "2 s of silence");
        assert!(
            frames[16000..17000].iter().any(|&sample| sample != 0),
            "the sound follows"
        );
        assert!(
            frames.len().abs_diff(20000) <= 1000,
            "2.5 s in total: {}",
            frames.len()
        );
    }

    fn stereo_wav(path: &Path, rate: u32, frames: usize) {
        let data = (frames * 4) as u32;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&rate.to_le_bytes());
        bytes.extend_from_slice(&(rate * 4).to_le_bytes());
        bytes.extend_from_slice(&4u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data.to_le_bytes());
        for _ in 0..frames {
            bytes.extend_from_slice(&1000i16.to_le_bytes());
            bytes.extend_from_slice(&3000i16.to_le_bytes());
        }
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn channels_are_mixed_to_mono() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("stereo.wav");
        stereo_wav(&path, 22050, 4410);

        let bytes = read_all(decode_to_wav(&path, &no_cancel()).expect("decoded"));

        assert_eq!(u16_at(&bytes, 20), 1, "PCM");
        assert_eq!(u16_at(&bytes, 22), 1, "one channel");
        assert_eq!(u32_at(&bytes, 24), 22050, "the source rate");
        assert_eq!(u16_at(&bytes, 34), 16, "16-bit");
        let frames = frames_of(&bytes);
        assert_eq!(frames.len(), 4410);
        assert!(
            frames.iter().all(|&sample| (sample - 2000).abs() <= 1),
            "the channel average"
        );
    }

    fn expect_failure(
        media: &Path,
        cancel: &AtomicBool,
        configure: impl FnOnce(&mut Tracked),
    ) -> AudioFallbackError {
        let token = Arc::new(());
        let mut output = Tracked::new(&token);
        configure(&mut output);
        let Err(error) = decode_with(media, cancel, || Ok(output)) else {
            panic!("expected a failure for {}", media.display());
        };
        assert_eq!(Arc::strong_count(&token), 1, "no handle remains");
        error
    }

    #[test]
    fn undecodable_audio_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let text = dir.path().join("notes.txt");
        std::fs::write(&text, "not media at all").unwrap();

        for media in [fixture("opus.mkv"), text] {
            let error = expect_failure(&media, &no_cancel(), |_| {});
            assert!(
                matches!(error, AudioFallbackError::Unsupported(_)),
                "{}: {error:?}",
                media.display()
            );
        }
    }

    #[test]
    fn a_missing_file_is_unreadable() {
        let error = expect_failure(Path::new("/does/not/exist.mkv"), &no_cancel(), |_| {});
        assert!(matches!(error, AudioFallbackError::Unreadable(_)), "{error:?}");
    }

    #[test]
    fn cancellation_releases_the_partial_file() {
        let preset = expect_failure(&fixture("late.mkv"), &AtomicBool::new(true), |_| {});
        assert!(matches!(preset, AudioFallbackError::Cancelled), "{preset:?}");

        let cancel = Arc::new(AtomicBool::new(false));
        let mid_job = expect_failure(&fixture("late.mkv"), &cancel, |output| {
            output.cancel_on_write = Some(Arc::clone(&cancel));
        });
        assert!(matches!(mid_job, AudioFallbackError::Cancelled), "{mid_job:?}");
    }

    #[test]
    fn a_write_failure_during_decoding_is_reported() {
        let error = expect_failure(&fixture("late.mkv"), &no_cancel(), |output| {
            output.fail_writes = true;
        });
        assert!(matches!(error, AudioFallbackError::Io(_)), "{error:?}");
    }

    /// Unix only: on Windows the file is delete-on-close instead, which a
    /// directory listing cannot observe while the handle is open.
    #[cfg(unix)]
    #[test]
    fn prepared_audio_has_no_name() {
        let dir = tempfile::tempdir().unwrap();
        let file = decode_into(&fixture("late.mkv"), &no_cancel(), dir.path()).expect("decoded");

        let entries: Vec<_> = std::fs::read_dir(dir.path()).unwrap().collect();
        assert!(entries.is_empty(), "the directory lists {entries:?}");
        assert!(file.metadata().unwrap().len() > HEADER_BYTES);
    }
}
