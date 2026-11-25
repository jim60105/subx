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
//! Symphonia ignores MP4 edit lists, so for MP4 the selected track's edit map
//! ([`crate::mp4_timing`]) places the samples instead: leading empty edits
//! become silence, media before the edit's media time is trimmed and media
//! past its duration is dropped (design D3 of `guard-mp4-preview-audio`).
//!
//! The output is an anonymous temporary file (`tempfile::tempfile_in`): on
//! Linux it never has a name (`O_TMPFILE`), other Unix systems unlink it right
//! after creating it, and Windows opens it delete-on-close. Dropping its last
//! handle frees it, and a crash leaves no named file behind.

use std::fs::File;
use std::io::{self, BufReader, BufWriter, Seek, SeekFrom, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::mp4_timing::{self, EditMap, Mp4TimingError};

/// Timestamp jitter, in milliseconds, that neither inserts nor drops samples.
pub const JITTER_TOLERANCE_MS: u64 = 20;
/// The largest `data` chunk whose RIFF size (`36 + data`) still fits a `u32`.
pub const MAX_WAV_DATA_BYTES: u64 = (u32::MAX - 36) as u64;

/// Bytes in the canonical PCM WAV header this module writes.
const HEADER_BYTES: u64 = 44;
/// Silence is written in chunks of at most this many frames, with the cancel
/// flag checked before each one.
const SILENCE_CHUNK_FRAMES: u64 = 8192;
static SILENCE: [u8; (SILENCE_CHUNK_FRAMES * 2) as usize] =
    [0; (SILENCE_CHUNK_FRAMES * 2) as usize];

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
    /// The MP4 edit list or fragment timing cannot be reproduced.
    Timing(String),
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
    let out = decode_with(media, cancel, || {
        tempfile::tempfile_in(dir).map(BufWriter::new)
    })?;
    out.into_inner()
        .map_err(|err| AudioFallbackError::Io(err.into_error()))
}

/// The decoding itself, over any output, with the MP4 edit map read from the
/// media.
fn decode_with<W: Write + Seek>(
    media: &Path,
    cancel: &AtomicBool,
    make: impl FnOnce() -> io::Result<W>,
) -> Result<W, AudioFallbackError> {
    decode_core(media, cancel, make, read_edit_map)
}

/// Reads the edit map of the track at `track_index` through a second handle.
fn read_edit_map(media: &Path, track_index: usize) -> Result<Option<EditMap>, AudioFallbackError> {
    let file = File::open(media).map_err(|err| AudioFallbackError::Unreadable(err.to_string()))?;
    // Every box header is read after a seek, which empties the buffer, so a
    // small one avoids refilling kilobytes per header.
    let mut reader = BufReader::with_capacity(64, file);
    mp4_timing::edit_map(&mut reader, track_index).map_err(timing_error)
}

/// Design D3: a broken structure cannot be decoded, a valid one whose timing
/// cannot be reproduced gets its own code.
fn timing_error(err: Mp4TimingError) -> AudioFallbackError {
    match err {
        Mp4TimingError::Malformed(reason) => AudioFallbackError::Unsupported(reason.to_string()),
        Mp4TimingError::Io(err) if err.kind() == io::ErrorKind::UnexpectedEof => {
            AudioFallbackError::Unsupported("the MP4 structure is truncated".to_string())
        }
        Mp4TimingError::Io(err) => AudioFallbackError::Unreadable(err.to_string()),
        Mp4TimingError::Unsupported(reason) => AudioFallbackError::Timing(reason.to_string()),
    }
}

/// The decoding with the edit map source injected. The output is only created
/// once the media has been probed, a decoder made and the timing accepted, and
/// it is dropped on every failure, so no handle to a partial file survives one.
fn decode_core<W: Write + Seek>(
    media: &Path,
    cancel: &AtomicBool,
    make: impl FnOnce() -> io::Result<W>,
    map_of: impl FnOnce(&Path, usize) -> Result<Option<EditMap>, AudioFallbackError>,
) -> Result<W, AudioFallbackError> {
    let source =
        File::open(media).map_err(|err| AudioFallbackError::Unreadable(err.to_string()))?;
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

    // Symphonia's MP4 track id is the `trak`'s position in `moov`.
    let placement = match map_of(media, track_id as usize)? {
        Some(map) => {
            // The parser and Symphonia must have read the same track.
            if time_base.map(|base| (base.numer, base.denom)) != Some((1, map.media_timescale)) {
                return Err(AudioFallbackError::Unsupported(
                    "the track's time base differs from its media timescale".to_string(),
                ));
            }
            Some(Placement::new(&map, rate))
        }
        None => None,
    };

    let mut writer = TimelineWriter::new(make()?, rate, MAX_WAV_DATA_BYTES)?;
    if let Some(placement) = &placement {
        writer.set_end(placement.end);
        writer.lead_silence(placement.lead, cancel)?;
    }
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

        let (start, drop) = match (&placement, time_base) {
            (Some(placement), _) => placement.place(packet.ts()),
            (None, Some(time_base)) => {
                let time = time_base.calc_time(packet.ts());
                let start = time
                    .seconds
                    .saturating_mul(u64::from(rate))
                    .saturating_add((time.frac * f64::from(rate)).round() as u64);
                (start, 0)
            }
            (None, None) => (packet.ts(), 0),
        };
        let kept = &mono[drop.min(mono.len() as u64) as usize..];
        if placement.is_some() && kept.is_empty() {
            // Wholly before the edit's media time.
            continue;
        }
        if writer.push(start, kept, cancel)? {
            break;
        }
    }

    if writer.kept_frames == 0 {
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

/// `a / b` rounded to the nearest integer, halves away from zero; `b > 0`.
fn near(a: i128, b: i128) -> i128 {
    if a >= 0 {
        (2 * a + b) / (2 * b)
    } else {
        -near(-a, b)
    }
}

fn saturating_u64(value: u128) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

/// An MP4 edit map converted to output frames (design D3).
#[derive(Debug, PartialEq)]
struct Placement {
    /// Leading silence, in frames.
    lead: u128,
    /// The frame at which the output ends, if the edit has a duration.
    end: Option<u64>,
    trim_ticks: u64,
    media_timescale: u32,
    rate: u32,
}

impl Placement {
    fn new(map: &EditMap, rate: u32) -> Self {
        let movie = i128::from(map.movie_timescale);
        // At most 1024 entries of u64 ticks times a u32 rate: far below i128.
        let lead = near(map.empty_ticks as i128 * i128::from(rate), movie) as u128;
        let end = map.segment_ticks.map(|ticks| {
            let scaled = u128::from(ticks) * u128::from(rate);
            saturating_u64(lead + scaled.div_ceil(movie as u128))
        });
        Self {
            lead,
            end,
            trim_ticks: map.trim_ticks,
            media_timescale: map.media_timescale,
            rate,
        }
    }

    /// The output frame of a packet at media time `ts`, and how many of its
    /// leading frames fall before the edit's media time and are dropped.
    fn place(&self, ts: u64) -> (u64, u64) {
        let ticks = i128::from(ts) - i128::from(self.trim_ticks);
        let rel = near(
            ticks * i128::from(self.rate),
            i128::from(self.media_timescale),
        );
        if rel < 0 {
            (
                saturating_u64(self.lead),
                saturating_u64(rel.unsigned_abs()),
            )
        } else {
            (saturating_u64(self.lead + rel as u128), 0)
        }
    }
}

/// Writes mono 16-bit frames at their absolute positions.
struct TimelineWriter<W: Write + Seek> {
    out: W,
    tolerance_frames: u64,
    /// Frames in the output, silence included.
    written_frames: u64,
    /// Decoded frames in the output, silence excluded.
    kept_frames: u64,
    max_frames: u64,
    /// Nothing is written at or past this frame.
    end: Option<u64>,
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
            kept_frames: 0,
            max_frames: max_data_bytes / 2,
            end: None,
        })
    }

    /// Sets the frame at which the output ends.
    fn set_end(&mut self, end: Option<u64>) {
        self.end = end;
    }

    /// Writes `frames` of silence before the first packet. Explicit because
    /// [`Self::push`] would absorb a delay within the jitter tolerance.
    fn lead_silence(
        &mut self,
        frames: u128,
        cancel: &AtomicBool,
    ) -> Result<(), AudioFallbackError> {
        if frames > u128::from(self.max_frames.saturating_sub(self.written_frames)) {
            return Err(AudioFallbackError::Unsupported(
                "output exceeds the WAV size limit".to_string(),
            ));
        }
        self.write_silence(frames as u64, cancel)
    }

    /// Silence in chunks, with the cancel flag checked before each one.
    fn write_silence(
        &mut self,
        frames: u64,
        cancel: &AtomicBool,
    ) -> Result<(), AudioFallbackError> {
        let mut remaining = frames;
        while remaining > 0 {
            if cancel.load(Ordering::SeqCst) {
                return Err(AudioFallbackError::Cancelled);
            }
            let chunk = remaining.min(SILENCE_CHUNK_FRAMES);
            self.out.write_all(&SILENCE[..(chunk * 2) as usize])?;
            self.written_frames += chunk;
            remaining -= chunk;
        }
        Ok(())
    }

    /// Places `mono` at `start_frame`. A start later than the end written so
    /// far by more than the tolerance is preceded by silence; one earlier by
    /// more than the tolerance loses its overlapping frames; anything within it
    /// is appended contiguously. Each packet is compared against its absolute
    /// timestamp, so jitter never accumulates past the tolerance.
    ///
    /// Silence and samples are clipped at the end set by [`Self::set_end`];
    /// returns `true` once the output has reached it.
    fn push(
        &mut self,
        start_frame: u64,
        mono: &[i16],
        cancel: &AtomicBool,
    ) -> Result<bool, AudioFallbackError> {
        let expected = self.written_frames;
        let length = mono.len() as u64;
        let (mut silence, skip) = if start_frame > expected.saturating_add(self.tolerance_frames) {
            (start_frame - expected, 0)
        } else if start_frame.saturating_add(self.tolerance_frames) < expected {
            (0, (expected - start_frame).min(length))
        } else {
            (0, 0)
        };
        let mut count = length - skip;
        if let Some(end) = self.end {
            let room = end.saturating_sub(expected);
            silence = silence.min(room);
            count = count.min(room - silence);
        }
        // Checked before anything is written, silence included, in `u128` so
        // a corrupt timestamp cannot overflow the comparison.
        if u128::from(silence) + u128::from(count)
            > u128::from(self.max_frames.saturating_sub(expected))
        {
            return Err(AudioFallbackError::Unsupported(
                "output exceeds the WAV size limit".to_string(),
            ));
        }

        self.write_silence(silence, cancel)?;
        let kept = &mono[skip as usize..(skip + count) as usize];
        let mut bytes = Vec::with_capacity(kept.len() * 2);
        for sample in kept {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        self.out.write_all(&bytes)?;
        self.written_frames += count;
        self.kept_frames += count;
        Ok(self.end.is_some_and(|end| self.written_frames >= end))
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

    // @covers sync-workflow/preview-audio-is-decoded-onto-the-media-timeline#gap-becomes-silence
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

    // @covers sync-workflow/preview-audio-is-decoded-onto-the-media-timeline#jitter-is-absorbed
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

    // @covers sync-workflow/preview-audio-is-decoded-onto-the-media-timeline#overlap-is-trimmed
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
        assert_eq!(
            frames[1000],
            (TOL + 1) as i16,
            "the overlapping frames are gone"
        );
        assert_eq!(*frames.last().unwrap(), 499);
    }

    // @covers sync-workflow/preview-audio-failures-are-reported-and-leave-no-file#oversized-output-is-refused
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
        assert_eq!(
            writer.out.get_ref().len() as u64,
            HEADER_BYTES + max_data_bytes
        );
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

    // @covers sync-workflow/preview-audio-failures-are-reported-and-leave-no-file#write-failure-is-reported
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

    // @covers sync-workflow/preview-audio-failures-are-reported-and-leave-no-file#cancellation-releases-the-partial-file
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

    // @covers sync-workflow/preview-audio-is-decoded-onto-the-media-timeline#late-start-becomes-silence
    #[test]
    fn a_late_start_becomes_silence() {
        let file = decode_to_wav(&fixture("late.mkv"), &no_cancel()).expect("decoded");
        let bytes = read_all(file);

        assert_eq!(u32_at(&bytes, 4) as usize, bytes.len() - 8, "RIFF size");
        assert_eq!(u32_at(&bytes, 40) as usize, bytes.len() - 44, "data size");
        assert_eq!(u32_at(&bytes, 24), RATE);
        let frames = frames_of(&bytes);
        assert!(
            frames[..16000].iter().all(|&sample| sample == 0),
            "2 s of silence"
        );
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

    // @covers sync-workflow/preview-audio-is-decoded-onto-the-media-timeline#channels-are-mixed-to-mono
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

    // @covers sync-workflow/preview-audio-failures-are-reported-and-leave-no-file#undecodable-audio-is-reported
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
        assert!(
            matches!(error, AudioFallbackError::Unreadable(_)),
            "{error:?}"
        );
    }

    // @covers sync-workflow/preview-audio-failures-are-reported-and-leave-no-file#cancellation-releases-the-partial-file
    #[test]
    fn cancellation_releases_the_partial_file() {
        let preset = expect_failure(&fixture("late.mkv"), &AtomicBool::new(true), |_| {});
        assert!(
            matches!(preset, AudioFallbackError::Cancelled),
            "{preset:?}"
        );

        let cancel = Arc::new(AtomicBool::new(false));
        let mid_job = expect_failure(&fixture("late.mkv"), &cancel, |output| {
            output.cancel_on_write = Some(Arc::clone(&cancel));
        });
        assert!(
            matches!(mid_job, AudioFallbackError::Cancelled),
            "{mid_job:?}"
        );
    }

    // @covers sync-workflow/preview-audio-failures-are-reported-and-leave-no-file#write-failure-is-reported
    #[test]
    fn a_write_failure_during_decoding_is_reported() {
        let error = expect_failure(&fixture("late.mkv"), &no_cancel(), |output| {
            output.fail_writes = true;
        });
        assert!(matches!(error, AudioFallbackError::Io(_)), "{error:?}");
    }

    /// Unix only: on Windows the file is delete-on-close instead, which a
    /// directory listing cannot observe while the handle is open.
    // @covers sync-workflow/preview-audio-belongs-to-its-session#prepared-audio-has-no-name
    #[cfg(unix)]
    #[test]
    fn prepared_audio_has_no_name() {
        let dir = tempfile::tempdir().unwrap();
        let file = decode_into(&fixture("late.mkv"), &no_cancel(), dir.path()).expect("decoded");

        let entries: Vec<_> = std::fs::read_dir(dir.path()).unwrap().collect();
        assert!(entries.is_empty(), "the directory lists {entries:?}");
        assert!(file.metadata().unwrap().len() > HEADER_BYTES);
    }

    // ─── MP4 timing ─────────────────────────────────────────────────────────

    fn edit(movie: u32, media: u32, empty: u128, trim: u64, segment: Option<u64>) -> EditMap {
        EditMap {
            movie_timescale: movie,
            media_timescale: media,
            empty_ticks: empty,
            trim_ticks: trim,
            segment_ticks: segment,
        }
    }

    type MapOf = fn(&Path, usize) -> Result<Option<EditMap>, AudioFallbackError>;

    fn decoded(
        media: &Path,
        map_of: impl FnOnce(&Path, usize) -> Result<Option<EditMap>, AudioFallbackError>,
    ) -> Result<Vec<i16>, AudioFallbackError> {
        decode_core(media, &no_cancel(), || Ok(Cursor::new(Vec::new())), map_of)
            .map(|out| frames_of(&out.into_inner()))
    }

    fn untimed(media: &Path) -> Vec<i16> {
        decoded(media, |_, _| Ok(None)).expect("decoded")
    }

    fn timed(media: &Path) -> Vec<i16> {
        decoded(media, read_edit_map as MapOf).expect("decoded")
    }

    fn sound_within(frames: &[i16], from: usize, within: usize) -> bool {
        frames[from..(from + within).min(frames.len())]
            .iter()
            .any(|&sample| sample.unsigned_abs() > 100)
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#encoder-priming-is-trimmed
    #[test]
    fn encoder_priming_is_trimmed() {
        let media = fixture("priming.mp4");
        let frames = timed(&media);
        let raw = untimed(&media);

        assert_eq!(frames.len(), 22050, "the edit's 500 ms at 44.1 kHz");
        assert_eq!(
            &frames[..1000],
            &raw[1024..2024],
            "starts at media time 1024"
        );
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#delay-becomes-silence
    #[test]
    fn a_delay_becomes_silence() {
        let frames = timed(&fixture("late.mp4"));

        assert!(
            frames[..87142].iter().all(|&sample| sample == 0),
            "1976 ms at 44.1 kHz"
        );
        assert!(sound_within(&frames, 87142, 3000), "the media follows");
        assert!(
            frames.len() <= 110251,
            "ends with the edit: {}",
            frames.len()
        );
        let map = read_edit_map(&fixture("late.mp4"), 0).unwrap().unwrap();
        assert_eq!(Placement::new(&map, 44100).lead, 87142, "exactly");
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#hostile-delay-is-bounded
    #[test]
    fn a_hostile_delay_ends_the_decoding() {
        let error = decoded(&fixture("priming.mp4"), |_, _| {
            Ok(Some(edit(1000, 44100, u128::from(u64::MAX), 0, None)))
        })
        .expect_err("beyond the WAV size limit");
        assert!(
            matches!(&error, AudioFallbackError::Unsupported(message) if message.contains("size limit")),
            "{error:?}"
        );

        let cancelled = decode_core(
            &fixture("priming.mp4"),
            &AtomicBool::new(true),
            || Ok(Cursor::new(Vec::new())),
            |_, _| Ok(Some(edit(1000, 44100, 2000, 0, None))),
        )
        .expect_err("cancelled");
        assert!(
            matches!(cancelled, AudioFallbackError::Cancelled),
            "{cancelled:?}"
        );
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#selected-track-decides
    #[test]
    fn the_selected_track_decides() {
        let first = timed(&fixture("two.mp4"));
        assert_eq!(first.len(), 22050);
        assert_eq!(
            first,
            timed(&fixture("priming.mp4")),
            "the undelayed track, no silence"
        );

        let video_first = timed(&fixture("video_first.mp4"));
        assert!(
            video_first[..14976].iter().all(|&sample| sample == 0),
            "1872 ms at 8 kHz"
        );
        assert!(sound_within(&video_first, 14976, 3000), "the audio follows");
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#short-delay-is-not-absorbed-as-jitter
    #[test]
    fn a_short_delay_is_not_absorbed_as_jitter() {
        let placement = Placement::new(&edit(1000, 48000, 10, 0, None), 48000);
        assert_eq!(placement.lead, 480, "10 ms");
        assert!(
            placement.lead <= u128::from(48000 * JITTER_TOLERANCE_MS / 1000),
            "push alone would absorb it"
        );

        let mut writer =
            TimelineWriter::new(Cursor::new(Vec::new()), 48000, MAX_WAV_DATA_BYTES).unwrap();
        writer.lead_silence(placement.lead, &no_cancel()).unwrap();
        let (start, drop) = placement.place(0);
        assert_eq!(drop, 0);
        writer.push(start, &[7; 100], &no_cancel()).unwrap();
        let frames = frames_of(&writer.finish().unwrap().into_inner());

        assert_eq!(frames.len(), 580);
        assert!(frames[..480].iter().all(|&sample| sample == 0));
        assert!(frames[480..].iter().all(|&sample| sample == 7));
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#trim-and-delay-compose
    #[test]
    fn trim_and_delay_compose() {
        let placement = Placement::new(&edit(1000, 48000, 500, 1024, None), 48000);
        // The sample at media time t holds t + 1, so silence stays distinct.
        let packet: Vec<i16> = (1..=2048).collect();
        let (start, drop) = placement.place(0);
        assert_eq!((start, drop), (24000, 1024));

        let mut writer =
            TimelineWriter::new(Cursor::new(Vec::new()), 48000, MAX_WAV_DATA_BYTES).unwrap();
        writer.lead_silence(placement.lead, &no_cancel()).unwrap();
        writer
            .push(start, &packet[drop as usize..], &no_cancel())
            .unwrap();
        let frames = frames_of(&writer.finish().unwrap().into_inner());

        assert!(frames[..24000].iter().all(|&sample| sample == 0));
        assert_eq!(frames[24000], 1025, "the sample at media time 1024");
        assert!(frames[24000..].iter().all(|&sample| sample > 1024));
        assert_eq!(frames.len(), 24000 + 1024);
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#timescales-are-kept-apart
    #[test]
    fn timescales_are_kept_apart() {
        let placement = Placement::new(&edit(1000, 48000, 30, 2400, None), 48000);
        assert_eq!(placement.lead, 1440, "30 movie ticks are 30 ms");
        assert_eq!(
            placement.place(2400),
            (1440, 0),
            "2400 media ticks are trimmed"
        );
        assert_eq!(placement.place(0), (1440, 2400));
        assert_eq!(placement.place(4800), (1440 + 2400, 0));
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#equal-audio-and-video-edits-keep-the-delay
    #[test]
    fn equal_audio_and_video_edits_keep_the_delay() {
        use crate::mp4_timing::tests::{file, mdat, moov, trak_spec};

        let delay = || Some(vec![(500, -1, 1, 0), (1000, 0, 1, 0)]);
        let both = file(&[
            moov(
                1000,
                0,
                &[trak_spec(1, 10240, delay()), trak_spec(2, 48000, delay())],
                &[],
            ),
            mdat(),
        ]);
        let video_only = file(&[
            moov(
                1000,
                0,
                &[trak_spec(1, 10240, delay()), trak_spec(2, 48000, None)],
                &[],
            ),
            mdat(),
        ]);
        let lead = |bytes: Vec<u8>| {
            let map = mp4_timing::edit_map(&mut Cursor::new(bytes), 1)
                .unwrap()
                .unwrap();
            Placement::new(&map, 48000).lead
        };

        assert_eq!(lead(both), 24000, "500 ms");
        assert_eq!(lead(video_only), 0);
    }

    fn write_all_packets(placement: &Placement, packets: u64) -> Vec<i16> {
        let mut writer =
            TimelineWriter::new(Cursor::new(Vec::new()), 48000, MAX_WAV_DATA_BYTES).unwrap();
        writer.set_end(placement.end);
        writer.lead_silence(placement.lead, &no_cancel()).unwrap();
        for index in 0..packets {
            let (start, _) = placement.place(index * 1024);
            if writer.push(start, &[3; 1024], &no_cancel()).unwrap() {
                break;
            }
        }
        frames_of(&writer.finish().unwrap().into_inner())
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#media-past-the-edit-is-dropped
    #[test]
    fn media_past_the_edit_is_dropped() {
        let placement = Placement::new(&edit(1000, 48000, 100, 0, Some(500)), 48000);
        assert_eq!(placement.end, Some(4800 + 24000));
        let frames = write_all_packets(&placement, 100);
        assert_eq!(frames.len(), 4800 + 24000, "the silence plus 500 ms");
        assert!(frames[4800..].iter().all(|&sample| sample == 3));

        // A zero duration or a fragmented file gives no segment.
        let open = Placement::new(&edit(1000, 48000, 100, 0, None), 48000);
        assert_eq!(open.end, None);
        assert_eq!(write_all_packets(&open, 100).len(), 4800 + 100 * 1024);
    }

    #[test]
    fn bounds_round_to_the_nearest_sample() {
        assert_eq!(near(1, 2), 1, "a half rounds up");
        assert_eq!(near(3, 2), 2);
        assert_eq!(near(-1, 2), -1, "and mirrored below zero");
        assert_eq!(near(-3, 2), -2);
        assert_eq!(near(4, 3), 1);
        assert_eq!(near(-4, 3), -1);

        // One movie tick at timescale 2 is half a frame at rate 1.
        assert_eq!(Placement::new(&edit(2, 2, 1, 0, None), 1).lead, 1);
        let placement = Placement::new(&edit(2, 2, 0, 1, Some(1)), 1);
        assert_eq!(placement.end, Some(1), "the end rounds up");
        assert_eq!(placement.place(0), (0, 1), "-0.5 frames drop one");
        assert_eq!(placement.place(2), (1, 0), "+0.5 frames start at one");
    }

    #[test]
    fn a_fully_trimmed_packet_is_dropped_whole() {
        let placement = Placement::new(&edit(1000, 48000, 0, 5000, None), 48000);
        let (start, drop) = placement.place(0);
        assert_eq!(start, 0);
        assert!(drop >= 1024, "{drop}");
        assert_eq!(placement.place(4096), (0, 904), "partly trimmed");
    }

    #[test]
    fn a_trim_past_all_media_is_refused() {
        for empty in [0, 100] {
            let error = decoded(&fixture("priming.mp4"), move |_, _| {
                Ok(Some(edit(1000, 44100, empty, u64::from(u32::MAX), None)))
            })
            .expect_err("no frame is kept");
            assert!(
                matches!(&error, AudioFallbackError::Unsupported(message) if message.contains("no audio")),
                "{error:?}"
            );
        }
    }

    #[test]
    fn an_end_inside_a_gap_cuts_the_silence() {
        let mut writer = writer();
        writer.set_end(Some(150));
        assert!(!writer.push(0, &[1; 100], &no_cancel()).unwrap());
        assert!(
            writer.push(300, &[2; 10], &no_cancel()).unwrap(),
            "the end is reached"
        );
        assert!(
            writer.push(310, &[2; 10], &no_cancel()).unwrap(),
            "nothing more"
        );
        let frames = frames_of(&writer.finish().unwrap().into_inner());

        assert_eq!(frames.len(), 150);
        assert!(frames[100..].iter().all(|&sample| sample == 0));
    }

    #[test]
    fn the_end_is_applied_before_the_size_limit() {
        let mut writer = TimelineWriter::new(Cursor::new(Vec::new()), RATE, 200).unwrap();
        writer.set_end(Some(100));
        assert!(writer.push(0, &[1; 150], &no_cancel()).unwrap());
        assert_eq!(writer.out.get_ref().len() as u64, HEADER_BYTES + 200);
    }

    #[test]
    fn a_delay_is_not_counted_twice() {
        let mut writer = writer();
        writer.lead_silence(1000, &no_cancel()).unwrap();
        writer.push(1000, &[5; 10], &no_cancel()).unwrap();
        let frames = frames_of(&writer.finish().unwrap().into_inner());

        assert_eq!(frames.len(), 1010, "the first packet adds no further zero");
        assert!(frames[1000..].iter().all(|&sample| sample == 5));
        assert_eq!(frames.iter().filter(|&&sample| sample == 0).count(), 1000);
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#hostile-delay-is-bounded
    #[test]
    fn a_hostile_delay_is_refused_before_it_is_written() {
        let mut writer = TimelineWriter::new(Cursor::new(Vec::new()), RATE, 1000).unwrap();
        for frames in [501, u128::from(u64::MAX) + 1, u128::MAX] {
            match writer.lead_silence(frames, &no_cancel()) {
                Err(AudioFallbackError::Unsupported(message)) => {
                    assert!(message.contains("size limit"), "{message}")
                }
                other => panic!("expected the size limit, got {other:?}"),
            }
            assert_eq!(
                writer.out.get_ref().len() as u64,
                HEADER_BYTES,
                "nothing written"
            );
        }
        writer.lead_silence(500, &no_cancel()).unwrap();
        assert_eq!(writer.out.get_ref().len() as u64, HEADER_BYTES + 1000);

        // Hostile values saturate rather than wrap.
        let huge = Placement::new(
            &edit(1, 1, u128::from(u64::MAX) * 1024, 0, Some(u64::MAX)),
            u32::MAX,
        );
        assert_eq!(huge.end, Some(u64::MAX));
        assert_eq!(huge.place(u64::MAX).0, u64::MAX);
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#hostile-delay-is-bounded
    #[test]
    fn cancelling_stops_the_leading_silence() {
        let token = Arc::new(());
        let cancel = Arc::new(AtomicBool::new(false));
        let mut writer =
            TimelineWriter::new(Tracked::new(&token), RATE, MAX_WAV_DATA_BYTES).unwrap();
        writer.out.cancel_on_write = Some(Arc::clone(&cancel));

        let result = writer.lead_silence(u128::from(3 * SILENCE_CHUNK_FRAMES), &cancel);

        assert!(
            matches!(result, Err(AudioFallbackError::Cancelled)),
            "{result:?}"
        );
        assert_eq!(
            writer.out.inner.get_ref().len() as u64,
            HEADER_BYTES + SILENCE_CHUNK_FRAMES * 2,
            "stopped after one chunk"
        );
    }

    /// `priming.mp4` with `patch` applied to its only `elst` box, whose type
    /// starts at byte 4934.
    fn patched_priming(dir: &Path, patch: impl FnOnce(&mut [u8])) -> PathBuf {
        let mut bytes = std::fs::read(fixture("priming.mp4")).unwrap();
        let at = bytes
            .windows(4)
            .position(|window| window == b"elst")
            .expect("an elst");
        assert_eq!(at, 4934, "the fixture's elst");
        patch(&mut bytes[at..]);
        let path = dir.join("patched.mp4");
        std::fs::write(&path, bytes).unwrap();
        path
    }

    fn panicking_make() -> io::Result<Cursor<Vec<u8>>> {
        panic!("no output may be created")
    }

    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#complex-edit-lists-are-refused
    // @covers sync-workflow/mp4-preview-audio-keeps-presentation-time#malformed-boxes-end-safely
    #[test]
    fn a_complex_edit_list_is_refused_before_any_output() {
        let dir = tempfile::tempdir().unwrap();
        let rate_two = patched_priming(dir.path(), |elst| {
            assert_eq!(&elst[20..22], &[0, 1], "rate 1.0");
            elst[20..22].copy_from_slice(&[0, 2]);
        });
        let error = decode_with(&rate_two, &no_cancel(), panicking_make).expect_err("refused");
        assert!(matches!(error, AudioFallbackError::Timing(_)), "{error:?}");

        let overcounted = patched_priming(dir.path(), |elst| {
            assert_eq!(&elst[8..12], &1u32.to_be_bytes(), "one entry");
            elst[8..12].copy_from_slice(&1000u32.to_be_bytes());
        });
        let error = decode_with(&overcounted, &no_cancel(), panicking_make).expect_err("refused");
        assert!(
            matches!(error, AudioFallbackError::Unsupported(_)),
            "{error:?}"
        );
    }

    #[test]
    fn a_time_base_unlike_the_media_timescale_is_refused() {
        let error = decoded(&fixture("priming.mp4"), |_, _| {
            Ok(Some(edit(1000, 48000, 0, 0, None)))
        })
        .expect_err("another track's timing");
        assert!(
            matches!(&error, AudioFallbackError::Unsupported(message) if message.contains("time base")),
            "{error:?}"
        );
    }

    #[test]
    fn timing_errors_map_to_fallback_errors() {
        assert!(matches!(
            timing_error(Mp4TimingError::Malformed("x")),
            AudioFallbackError::Unsupported(_)
        ));
        assert!(matches!(
            timing_error(Mp4TimingError::Io(io::ErrorKind::UnexpectedEof.into())),
            AudioFallbackError::Unsupported(_)
        ));
        assert!(matches!(
            timing_error(Mp4TimingError::Io(io::Error::other("gone"))),
            AudioFallbackError::Unreadable(_)
        ));
        assert!(matches!(
            timing_error(Mp4TimingError::Unsupported("x")),
            AudioFallbackError::Timing(_)
        ));
        assert!(matches!(
            read_edit_map(Path::new("/does/not/exist.mp4"), 0),
            Err(AudioFallbackError::Unreadable(_))
        ));
    }

    #[test]
    fn matroska_has_no_edit_map() {
        assert!(read_edit_map(&fixture("late.mkv"), 0).unwrap().is_none());
    }
}
