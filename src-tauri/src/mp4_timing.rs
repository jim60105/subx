//! The edit list of one MP4 track, read with bounded parsing (design D1, D2).
//!
//! Symphonia 0.5.5 places MP4 samples by their `stts` timestamps and ignores
//! the edit list and fragment decode times, so the audio fallback reads them
//! itself. Only the simple shape is accepted: leading empty edits, then one
//! normal-rate edit. Anything else is reported as [`Mp4TimingError::Unsupported`]
//! rather than guessed, because a wrong preview is worse than none.
//!
//! Boxes are walked with `Seek`; no payload is loaded whole, every field is
//! checked to lie inside its box before it is read, and the number of boxes,
//! tracks and edit list entries is bounded.

use std::io::{self, Read, Seek, SeekFrom};

/// Why the edit list could not be used.
#[derive(Debug)]
pub enum Mp4TimingError {
    /// Reading the file failed.
    Io(io::Error),
    /// The box structure is broken or exceeds a parsing limit.
    Malformed(&'static str),
    /// The structure is valid but its timing cannot be reproduced.
    Unsupported(&'static str),
}

impl From<io::Error> for Mp4TimingError {
    fn from(err: io::Error) -> Self {
        Self::Io(err)
    }
}

/// Where the selected track's media sits on the movie timeline.
#[derive(Debug, PartialEq)]
pub struct EditMap {
    pub movie_timescale: u32,
    pub media_timescale: u32,
    /// Leading empty edits, in movie ticks.
    pub empty_ticks: u128,
    /// Media before the edit's media time, in media ticks.
    pub trim_ticks: u64,
    /// The edit's duration in movie ticks; `None` plays to the end.
    pub segment_ticks: Option<u64>,
}

/// The parsing bounds of design D2, injectable so tests stay small.
#[derive(Clone, Copy)]
struct Limits {
    boxes_per_container: u32,
    boxes_total: u32,
    traks: u32,
    elst_entries: u32,
}

const LIMITS: Limits = Limits {
    boxes_per_container: 100_000,
    boxes_total: 200_000,
    traks: 4096,
    elst_entries: 1024,
};

/// The edit map of the track at `track_index` among `moov/trak` in file
/// order, the index Symphonia uses as its track id.
///
/// `None` when the file is not MP4 (no `ftyp` at byte 4).
pub fn edit_map<R: Read + Seek>(
    reader: &mut R,
    track_index: usize,
) -> Result<Option<EditMap>, Mp4TimingError> {
    edit_map_with(reader, track_index, LIMITS)
}

fn edit_map_with<R: Read + Seek>(
    reader: &mut R,
    track_index: usize,
    limits: Limits,
) -> Result<Option<EditMap>, Mp4TimingError> {
    let file_len = reader.seek(SeekFrom::End(0))?;
    if file_len < 8 {
        return Ok(None);
    }
    let mut magic = [0u8; 4];
    read_at(reader, 4, &mut magic)?;
    if &magic != b"ftyp" {
        return Ok(None);
    }
    let mut walker = Walker {
        reader,
        file_len,
        limits,
        visited: 0,
    };
    walker.walk(track_index).map(Some)
}

struct Header {
    typ: [u8; 4],
    payload: u64,
    end: u64,
}

impl Header {
    fn payload_len(&self) -> u64 {
        self.end - self.payload
    }
}

/// An entry of `elst`: duration, media time, rate integer and fraction.
type Edit = (u64, i64, i16, i16);

#[derive(Default)]
struct Trak {
    track_id: Option<u32>,
    media_timescale: Option<u32>,
    edits: Option<Vec<Edit>>,
    seen_edts: bool,
    seen_mdia: bool,
}

struct Moov {
    movie_timescale: u32,
    fragmented: bool,
    track_id: u32,
    media_timescale: u32,
    edits: Vec<Edit>,
}

struct Walker<'a, R> {
    reader: &'a mut R,
    file_len: u64,
    limits: Limits,
    visited: u32,
}

impl<R: Read + Seek> Walker<'_, R> {
    fn walk(&mut self, track_index: usize) -> Result<EditMap, Mp4TimingError> {
        let mut moov: Option<Moov> = None;
        let mut count = 0;
        let mut pos = 0;
        while let Some(header) = self.header(pos, self.file_len, true, &mut count)? {
            pos = header.end;
            match &header.typ {
                b"moov" => {
                    if moov.is_some() {
                        return Err(Mp4TimingError::Malformed("more than one moov"));
                    }
                    moov = Some(self.moov(&header, track_index)?);
                }
                b"moof" => {
                    if let Some(found) = moov.as_ref().filter(|moov| moov.fragmented) {
                        if let Some(decode_time) = self.moof(&header, found.track_id)? {
                            if decode_time != 0 {
                                return Err(Mp4TimingError::Unsupported(
                                    "the first fragment does not start at 0",
                                ));
                            }
                            break;
                        }
                    }
                }
                _ => {}
            }
        }
        let moov = moov.ok_or(Mp4TimingError::Malformed("no moov"))?;
        resolve(moov)
    }

    /// The header of the box at `pos`, or `None` at the end of the top level.
    fn header(
        &mut self,
        pos: u64,
        parent_end: u64,
        top: bool,
        count: &mut u32,
    ) -> Result<Option<Header>, Mp4TimingError> {
        let left = parent_end - pos;
        if left == 0 || (top && left < 8) {
            return Ok(None);
        }
        if left < 8 {
            return Err(Mp4TimingError::Malformed("truncated box header"));
        }
        *count += 1;
        if *count > self.limits.boxes_per_container {
            return Err(Mp4TimingError::Malformed("too many boxes in one container"));
        }
        self.visited += 1;
        if self.visited > self.limits.boxes_total {
            return Err(Mp4TimingError::Malformed("too many boxes"));
        }
        let mut raw = [0u8; 8];
        read_at(self.reader, pos, &mut raw)?;
        let typ = [raw[4], raw[5], raw[6], raw[7]];
        let (size, header_len) = match u32::from_be_bytes([raw[0], raw[1], raw[2], raw[3]]) {
            1 => {
                if left < 16 {
                    return Err(Mp4TimingError::Malformed("truncated box header"));
                }
                let mut large = [0u8; 8];
                read_at(self.reader, pos + 8, &mut large)?;
                (u64::from_be_bytes(large), 16)
            }
            0 if top => (left, 8),
            0 => return Err(Mp4TimingError::Malformed("a nested box extends to the end")),
            size => (u64::from(size), 8),
        };
        if size < header_len {
            return Err(Mp4TimingError::Malformed(
                "a box is smaller than its header",
            ));
        }
        let mut end = pos
            .checked_add(size)
            .ok_or(Mp4TimingError::Malformed("a box size overflows"))?;
        if end > parent_end {
            if top && matches!(&typ, b"mdat" | b"free" | b"skip") {
                end = parent_end;
            } else {
                return Err(Mp4TimingError::Malformed("a box overruns its parent"));
            }
        }
        Ok(Some(Header {
            typ,
            payload: pos + header_len,
            end,
        }))
    }

    /// Calls `visit` for each child of `parent`.
    fn children(
        &mut self,
        parent: &Header,
        mut visit: impl FnMut(&mut Self, Header) -> Result<(), Mp4TimingError>,
    ) -> Result<(), Mp4TimingError> {
        let mut count = 0;
        let mut pos = parent.payload;
        while let Some(child) = self.header(pos, parent.end, false, &mut count)? {
            pos = child.end;
            visit(self, child)?;
        }
        Ok(())
    }

    fn moov(&mut self, moov: &Header, track_index: usize) -> Result<Moov, Mp4TimingError> {
        let mut movie_timescale = None;
        let mut fragmented = false;
        let mut traks: u32 = 0;
        let mut selected = None;
        self.children(moov, |walker, child| {
            match &child.typ {
                b"mvhd" => {
                    if movie_timescale.is_some() {
                        return Err(Mp4TimingError::Malformed("more than one mvhd"));
                    }
                    movie_timescale = Some(walker.versioned_u32(&child, 8, 16)?);
                }
                b"mvex" => fragmented = true,
                b"trak" => {
                    if traks == walker.limits.traks {
                        return Err(Mp4TimingError::Malformed("too many tracks"));
                    }
                    if traks as usize == track_index {
                        selected = Some(walker.trak(&child)?);
                    }
                    traks += 1;
                }
                _ => {}
            }
            Ok(())
        })?;
        let movie_timescale = movie_timescale.ok_or(Mp4TimingError::Malformed("no mvhd"))?;
        let trak = selected.ok_or(Mp4TimingError::Malformed("no such track"))?;
        Ok(Moov {
            movie_timescale,
            fragmented,
            track_id: trak.track_id.ok_or(Mp4TimingError::Malformed("no tkhd"))?,
            media_timescale: trak
                .media_timescale
                .ok_or(Mp4TimingError::Malformed("no mdhd"))?,
            edits: trak.edits.unwrap_or_default(),
        })
    }

    fn trak(&mut self, trak: &Header) -> Result<Trak, Mp4TimingError> {
        let mut out = Trak::default();
        self.children(trak, |walker, child| {
            match &child.typ {
                b"tkhd" => {
                    if out.track_id.is_some() {
                        return Err(Mp4TimingError::Malformed("more than one tkhd"));
                    }
                    out.track_id = Some(walker.versioned_u32(&child, 8, 16)?);
                }
                b"edts" => {
                    if out.seen_edts {
                        return Err(Mp4TimingError::Malformed("more than one edts"));
                    }
                    out.seen_edts = true;
                    walker.children(&child, |walker, child| {
                        if &child.typ == b"elst" {
                            if out.edits.is_some() {
                                return Err(Mp4TimingError::Malformed("more than one elst"));
                            }
                            out.edits = Some(walker.elst(&child)?);
                        }
                        Ok(())
                    })?;
                }
                b"mdia" => {
                    if out.seen_mdia {
                        return Err(Mp4TimingError::Malformed("more than one mdia"));
                    }
                    out.seen_mdia = true;
                    walker.children(&child, |walker, child| {
                        if &child.typ == b"mdhd" {
                            if out.media_timescale.is_some() {
                                return Err(Mp4TimingError::Malformed("more than one mdhd"));
                            }
                            let timescale = walker.versioned_u32(&child, 8, 16)?;
                            if timescale == 0 {
                                return Err(Mp4TimingError::Malformed("zero media timescale"));
                            }
                            out.media_timescale = Some(timescale);
                        }
                        Ok(())
                    })?;
                }
                _ => {}
            }
            Ok(())
        })?;
        Ok(out)
    }

    fn elst(&mut self, elst: &Header) -> Result<Vec<Edit>, Mp4TimingError> {
        let version = self.version(elst)?;
        let count = self.u32_in(elst, 4)?;
        if count > self.limits.elst_entries {
            return Err(Mp4TimingError::Malformed("too many edit list entries"));
        }
        let entry_len: u64 = if version == 0 { 12 } else { 20 };
        if 8 + u64::from(count) * entry_len > elst.payload_len() {
            return Err(Mp4TimingError::Malformed(
                "the edit list claims more entries than it holds",
            ));
        }
        let mut entries = Vec::with_capacity(count as usize);
        let mut buf = [0u8; 20];
        for index in 0..u64::from(count) {
            let entry = &mut buf[..entry_len as usize];
            read_at(self.reader, elst.payload + 8 + index * entry_len, entry)?;
            let rate_int = i16::from_be_bytes([entry[entry.len() - 4], entry[entry.len() - 3]]);
            let rate_frac = i16::from_be_bytes([entry[entry.len() - 2], entry[entry.len() - 1]]);
            let (duration, media_time) = if version == 0 {
                (
                    u64::from(u32::from_be_bytes(entry[0..4].try_into().expect("4 bytes"))),
                    i64::from(i32::from_be_bytes(entry[4..8].try_into().expect("4 bytes"))),
                )
            } else {
                (
                    u64::from_be_bytes(entry[0..8].try_into().expect("8 bytes")),
                    i64::from_be_bytes(entry[8..16].try_into().expect("8 bytes")),
                )
            };
            entries.push((duration, media_time, rate_int, rate_frac));
        }
        Ok(entries)
    }

    /// The decode time of the first `traf` for `track_id` in this `moof`:
    /// `Some(0)` when it has no `tfdt`, `None` when the track is not in it.
    fn moof(&mut self, moof: &Header, track_id: u32) -> Result<Option<u64>, Mp4TimingError> {
        let mut found = None;
        self.children(moof, |walker, traf| {
            if found.is_some() || &traf.typ != b"traf" {
                return Ok(());
            }
            let mut tfhd = None;
            let mut tfdt = None;
            walker.children(&traf, |walker, child| {
                match &child.typ {
                    b"tfhd" if tfhd.is_none() => tfhd = Some(walker.u32_in(&child, 4)?),
                    b"tfdt" if tfdt.is_none() => {
                        tfdt = Some(match walker.version(&child)? {
                            0 => u64::from(walker.u32_in(&child, 4)?),
                            _ => walker.u64_in(&child, 4)?,
                        })
                    }
                    _ => {}
                }
                Ok(())
            })?;
            if tfhd == Some(track_id) {
                found = Some(tfdt.unwrap_or(0));
            }
            Ok(())
        })?;
        Ok(found)
    }

    /// The version byte of a full box; only 0 and 1 are known.
    fn version(&mut self, header: &Header) -> Result<u8, Mp4TimingError> {
        let mut version = [0u8; 1];
        self.field(header, 0, &mut version)?;
        match version[0] {
            0 | 1 => Ok(version[0]),
            _ => Err(Mp4TimingError::Malformed("unknown box version")),
        }
    }

    /// A `u32` at `v0` or `v1` bytes after the version and flags.
    fn versioned_u32(&mut self, header: &Header, v0: u64, v1: u64) -> Result<u32, Mp4TimingError> {
        let offset = if self.version(header)? == 0 { v0 } else { v1 };
        self.u32_in(header, 4 + offset)
    }

    fn u32_in(&mut self, header: &Header, offset: u64) -> Result<u32, Mp4TimingError> {
        let mut bytes = [0u8; 4];
        self.field(header, offset, &mut bytes)?;
        Ok(u32::from_be_bytes(bytes))
    }

    fn u64_in(&mut self, header: &Header, offset: u64) -> Result<u64, Mp4TimingError> {
        let mut bytes = [0u8; 8];
        self.field(header, offset, &mut bytes)?;
        Ok(u64::from_be_bytes(bytes))
    }

    /// Reads `buf` at `offset` into the payload, refusing to read past the box.
    fn field(
        &mut self,
        header: &Header,
        offset: u64,
        buf: &mut [u8],
    ) -> Result<(), Mp4TimingError> {
        if offset + buf.len() as u64 > header.payload_len() {
            return Err(Mp4TimingError::Malformed(
                "a box is too short for its fields",
            ));
        }
        read_at(self.reader, header.payload + offset, buf)
    }
}

fn read_at<R: Read + Seek>(reader: &mut R, pos: u64, buf: &mut [u8]) -> Result<(), Mp4TimingError> {
    reader.seek(SeekFrom::Start(pos))?;
    reader.read_exact(buf)?;
    Ok(())
}

/// Applies the rule of design D1 to the selected track.
fn resolve(moov: Moov) -> Result<EditMap, Mp4TimingError> {
    let movie_timescale = match (moov.movie_timescale, moov.edits.is_empty()) {
        (0, false) => return Err(Mp4TimingError::Malformed("zero movie timescale")),
        (0, true) => 1,
        (timescale, _) => timescale,
    };
    let mut map = EditMap {
        movie_timescale,
        media_timescale: moov.media_timescale,
        empty_ticks: 0,
        trim_ticks: 0,
        segment_ticks: None,
    };
    if moov.edits.is_empty() {
        return Ok(map);
    }
    let mut edits = moov.edits.iter();
    let normal = loop {
        match edits.next() {
            Some(&(duration, -1, _, _)) => map.empty_ticks += u128::from(duration),
            Some(edit) => break edit,
            None => {
                return Err(Mp4TimingError::Unsupported(
                    "the edit list has only empty edits",
                ))
            }
        }
    };
    let &(duration, media_time, rate_int, rate_frac) = normal;
    if media_time < 0 {
        return Err(Mp4TimingError::Unsupported(
            "an edit has a negative media time",
        ));
    }
    if (rate_int, rate_frac) != (1, 0) {
        return Err(Mp4TimingError::Unsupported(
            "an edit plays at a rate other than 1",
        ));
    }
    if edits.any(|&(_, media_time, _, _)| media_time != -1) {
        return Err(Mp4TimingError::Unsupported(
            "the edit list has more than one edit",
        ));
    }
    map.trim_ticks = media_time as u64;
    map.segment_ticks = (duration != 0 && !moov.fragmented).then_some(duration);
    Ok(map)
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::Cursor;

    use super::*;

    fn bx(typ: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut out = ((payload.len() + 8) as u32).to_be_bytes().to_vec();
        out.extend_from_slice(typ);
        out.extend_from_slice(payload);
        out
    }

    fn full(typ: &[u8; 4], version: u8, body: &[u8]) -> Vec<u8> {
        let mut payload = vec![version, 0, 0, 0];
        payload.extend_from_slice(body);
        bx(typ, &payload)
    }

    /// `mvhd`, `mdhd` or `tkhd`: `value` at the field's offset for `version`.
    fn header_box(typ: &[u8; 4], version: u8, value: u32) -> Vec<u8> {
        let skip = if version == 0 { 8 } else { 16 };
        let mut body = vec![0; skip];
        body.extend_from_slice(&value.to_be_bytes());
        body.extend_from_slice(&[0; 8]);
        full(typ, version, &body)
    }

    fn elst(version: u8, entries: &[Edit]) -> Vec<u8> {
        let mut body = (entries.len() as u32).to_be_bytes().to_vec();
        for &(duration, media_time, rate_int, rate_frac) in entries {
            if version == 0 {
                body.extend_from_slice(&(duration as u32).to_be_bytes());
                body.extend_from_slice(&(media_time as i32).to_be_bytes());
            } else {
                body.extend_from_slice(&duration.to_be_bytes());
                body.extend_from_slice(&media_time.to_be_bytes());
            }
            body.extend_from_slice(&rate_int.to_be_bytes());
            body.extend_from_slice(&rate_frac.to_be_bytes());
        }
        full(b"elst", version, &body)
    }

    pub(crate) struct TrakSpec {
        id: u32,
        media_timescale: u32,
        edits: Option<Vec<Edit>>,
        version: u8,
    }

    pub(crate) fn trak_spec(id: u32, media_timescale: u32, edits: Option<Vec<Edit>>) -> TrakSpec {
        TrakSpec {
            id,
            media_timescale,
            edits,
            version: 0,
        }
    }

    fn trak(spec: &TrakSpec) -> Vec<u8> {
        let mut body = header_box(b"tkhd", spec.version, spec.id);
        if let Some(edits) = &spec.edits {
            body.extend(bx(b"edts", &elst(spec.version, edits)));
        }
        let mdia = header_box(b"mdhd", spec.version, spec.media_timescale);
        body.extend(bx(b"mdia", &mdia));
        bx(b"trak", &body)
    }

    pub(crate) fn moov(
        movie_timescale: u32,
        version: u8,
        traks: &[TrakSpec],
        extra: &[u8],
    ) -> Vec<u8> {
        let mut body = header_box(b"mvhd", version, movie_timescale);
        for spec in traks {
            body.extend(trak(spec));
        }
        body.extend_from_slice(extra);
        bx(b"moov", &body)
    }

    pub(crate) fn file(parts: &[Vec<u8>]) -> Vec<u8> {
        let mut out = bx(b"ftyp", b"isom\0\0\x02\0");
        for part in parts {
            out.extend_from_slice(part);
        }
        out
    }

    pub(crate) fn mdat() -> Vec<u8> {
        bx(b"mdat", &[0xAA; 64])
    }

    fn map_of(bytes: Vec<u8>, index: usize) -> Result<Option<EditMap>, Mp4TimingError> {
        edit_map(&mut Cursor::new(bytes), index)
    }

    fn mapped(bytes: Vec<u8>, index: usize) -> EditMap {
        map_of(bytes, index).expect("parsed").expect("an MP4")
    }

    fn malformed(result: Result<Option<EditMap>, Mp4TimingError>) -> &'static str {
        match result {
            Err(Mp4TimingError::Malformed(reason)) => reason,
            other => panic!("expected Malformed, got {other:?}"),
        }
    }

    fn unsupported(result: Result<Option<EditMap>, Mp4TimingError>) -> &'static str {
        match result {
            Err(Mp4TimingError::Unsupported(reason)) => reason,
            other => panic!("expected Unsupported, got {other:?}"),
        }
    }

    fn audio(edits: Vec<Edit>) -> Vec<u8> {
        file(&[
            mdat(),
            moov(1000, 0, &[trak_spec(1, 48000, Some(edits))], &[]),
        ])
    }

    #[test]
    fn a_file_without_ftyp_is_not_mp4() {
        assert!(map_of(Vec::new(), 0).unwrap().is_none());
        assert!(map_of(bx(b"RIFF", &[0; 32]), 0).unwrap().is_none());
        let mut matroska = vec![0x1A, 0x45, 0xDF, 0xA3];
        matroska.extend_from_slice(&[0; 32]);
        assert!(map_of(matroska, 0).unwrap().is_none());
    }

    #[test]
    fn no_edit_list_means_no_delay_and_no_trim() {
        let expected = EditMap {
            movie_timescale: 1000,
            media_timescale: 48000,
            empty_ticks: 0,
            trim_ticks: 0,
            segment_ticks: None,
        };
        let none = file(&[moov(1000, 0, &[trak_spec(1, 48000, None)], &[]), mdat()]);
        assert_eq!(mapped(none, 0), expected);
        assert_eq!(mapped(audio(vec![]), 0), expected, "zero entries");
        // An edts holding no elst.
        let mut body = header_box(b"tkhd", 0, 1);
        body.extend(bx(b"edts", &[]));
        body.extend(bx(b"mdia", &header_box(b"mdhd", 0, 48000)));
        let mut moov_body = header_box(b"mvhd", 0, 1000);
        moov_body.extend(bx(b"trak", &body));
        assert_eq!(mapped(file(&[bx(b"moov", &moov_body)]), 0), expected);
    }

    #[test]
    fn delay_and_trim_are_read() {
        let map = mapped(audio(vec![(1976, -1, 1, 0), (524, 0, 1, 0)]), 0);
        assert_eq!(map.empty_ticks, 1976);
        assert_eq!(map.trim_ticks, 0);
        assert_eq!(map.segment_ticks, Some(524));

        let priming = mapped(audio(vec![(500, 1024, 1, 0)]), 0);
        assert_eq!((priming.empty_ticks, priming.trim_ticks), (0, 1024));
    }

    #[test]
    fn timescales_are_kept_apart() {
        let map = mapped(audio(vec![(30, -1, 1, 0), (1000, 2400, 1, 0)]), 0);
        assert_eq!(map.movie_timescale, 1000);
        assert_eq!(map.media_timescale, 48000);
        assert_eq!(map.empty_ticks, 30, "movie ticks");
        assert_eq!(map.trim_ticks, 2400, "media ticks");
    }

    #[test]
    fn empty_edits_are_summed_whatever_their_rate_and_trailing_ones_are_ignored() {
        let map = mapped(
            audio(vec![
                (10, -1, 0, 0),
                (20, -1, 1, 0),
                (500, 0, 1, 0),
                (99, -1, 1, 0),
            ]),
            0,
        );
        assert_eq!(map.empty_ticks, 30);
        assert_eq!(map.segment_ticks, Some(500));
    }

    #[test]
    fn the_selected_track_decides() {
        let traks = [
            trak_spec(1, 44100, Some(vec![(500, 1024, 1, 0)])),
            trak_spec(2, 44100, Some(vec![(1976, -1, 1, 0), (524, 0, 1, 0)])),
        ];
        let bytes = file(&[mdat(), moov(1000, 0, &traks, &[])]);
        assert_eq!(mapped(bytes.clone(), 0).empty_ticks, 0);
        assert_eq!(mapped(bytes, 1).empty_ticks, 1976);
    }

    #[test]
    fn equal_video_edits_are_not_consulted() {
        let video = trak_spec(1, 10240, Some(vec![(500, -1, 1, 0), (1000, 0, 1, 0)]));
        let delayed = trak_spec(2, 48000, Some(vec![(500, -1, 1, 0), (1000, 0, 1, 0)]));
        let both = file(&[moov(1000, 0, &[video, delayed], &[]), mdat()]);
        assert_eq!(mapped(both, 1).empty_ticks, 500, "the audio's own delay");

        let video = trak_spec(1, 10240, Some(vec![(500, -1, 1, 0), (1000, 0, 1, 0)]));
        let plain = trak_spec(2, 48000, None);
        let video_only = file(&[moov(1000, 0, &[video, plain], &[]), mdat()]);
        assert_eq!(
            mapped(video_only, 1).empty_ticks,
            0,
            "the video's delay is ignored"
        );
    }

    #[test]
    fn complex_edit_lists_are_refused() {
        for edits in [
            vec![(500, 0, 1, 0), (500, 1000, 1, 0)],
            vec![(500, 0, 1, 0), (100, -1, 1, 0), (500, 1000, 1, 0)],
            vec![(500, 0, 2, 0)],
            vec![(500, 0, 1, 0x4000)],
            vec![(500, -1, 1, 0)],
            vec![(500, -2, 1, 0)],
        ] {
            unsupported(map_of(audio(edits.clone()), 0));
        }
    }

    #[test]
    fn both_versions_and_box_orders_give_the_same_result() {
        let edits = vec![(1976, -1, 1, 0), (524, 1024, 1, 0)];
        let mut results = Vec::new();
        for version in [0, 1] {
            let spec = || TrakSpec {
                version,
                ..trak_spec(1, 44100, Some(edits.clone()))
            };
            results.push(mapped(
                file(&[mdat(), moov(1000, version, &[spec()], &[])]),
                0,
            ));
            results.push(mapped(
                file(&[moov(1000, version, &[spec()], &[]), mdat()]),
                0,
            ));
        }
        assert!(
            results.windows(2).all(|pair| pair[0] == pair[1]),
            "{results:?}"
        );
        assert_eq!(results[0].empty_ticks, 1976);
        assert_eq!(results[0].trim_ticks, 1024);
    }

    #[test]
    fn a_zero_duration_or_mvex_gives_no_segment() {
        assert_eq!(mapped(audio(vec![(0, 1024, 1, 0)]), 0).segment_ticks, None);
        let fragmented = file(&[moov(
            1000,
            0,
            &[trak_spec(1, 48000, Some(vec![(500, 0, 1, 0)]))],
            &bx(b"mvex", &[]),
        )]);
        assert_eq!(mapped(fragmented, 0).segment_ticks, None);
    }

    fn moof(track_id: u32, tfdt: Option<(u8, u64)>) -> Vec<u8> {
        let mut traf = full(b"tfhd", 0, &track_id.to_be_bytes());
        match tfdt {
            Some((0, time)) => traf.extend(full(b"tfdt", 0, &(time as u32).to_be_bytes())),
            Some((version, time)) => traf.extend(full(b"tfdt", version, &time.to_be_bytes())),
            None => {}
        }
        bx(b"moof", &bx(b"traf", &traf))
    }

    fn fragmented(fragments: &[Vec<u8>]) -> Vec<u8> {
        // tkhd id 7 at trak index 0, so matching by index would fail.
        let mvex = bx(b"mvex", &[]);
        let mut parts = vec![moov(1000, 0, &[trak_spec(7, 48000, None)], &mvex)];
        parts.extend_from_slice(fragments);
        file(&parts)
    }

    #[test]
    fn a_late_first_fragment_is_refused() {
        for version in [0, 1] {
            unsupported(map_of(
                fragmented(&[moof(7, Some((version, 1024))), mdat()]),
                0,
            ));
        }
        // Another track's late fragment first, then ours at 0.
        assert!(map_of(
            fragmented(&[moof(3, Some((0, 99))), moof(7, Some((1, 0)))]),
            0
        )
        .is_ok());
        // Another track's fragment at 0 first, then ours late.
        unsupported(map_of(
            fragmented(&[moof(3, Some((0, 0))), moof(7, Some((0, 99)))]),
            0,
        ));
        // No tfdt counts as 0; later fragments are not checked.
        assert!(map_of(fragmented(&[moof(7, None), moof(7, Some((0, 5)))]), 0).is_ok());
        // No fragment for the track: everything is in moov.
        assert!(map_of(fragmented(&[mdat()]), 0).is_ok());
        // A moof before moov is not a fragment of this movie.
        let mut early = file(&[moof(7, Some((0, 5)))]);
        early.extend(moov(
            1000,
            0,
            &[trak_spec(7, 48000, None)],
            &bx(b"mvex", &[]),
        ));
        assert!(map_of(early, 0).is_ok());
    }

    #[test]
    fn a_non_fragmented_file_ignores_moof() {
        let bytes = file(&[
            moov(1000, 0, &[trak_spec(7, 48000, None)], &[]),
            moof(7, Some((0, 5))),
        ]);
        assert!(map_of(bytes, 0).is_ok());
    }

    #[test]
    fn a_64_bit_box_size_is_read() {
        let mut large = 1u32.to_be_bytes().to_vec();
        large.extend_from_slice(b"mdat");
        large.extend_from_slice(&(16u64 + 40).to_be_bytes());
        large.extend_from_slice(&[0; 40]);
        let bytes = file(&[large, moov(1000, 0, &[trak_spec(1, 48000, None)], &[])]);
        assert_eq!(mapped(bytes, 0).media_timescale, 48000);

        let mut short = file(&[moov(1000, 0, &[trak_spec(1, 48000, None)], &[])]);
        short.extend_from_slice(&1u32.to_be_bytes());
        short.extend_from_slice(b"mdat\0\0\0\0");
        malformed(map_of(short, 0));

        let mut tiny = 1u32.to_be_bytes().to_vec();
        tiny.extend_from_slice(b"free");
        tiny.extend_from_slice(&8u64.to_be_bytes());
        malformed(map_of(file(&[tiny]), 0));
    }

    #[test]
    fn truncated_but_playable_top_levels_are_accepted() {
        let good = || moov(1000, 0, &[trak_spec(1, 48000, None)], &[]);
        let mut tail = file(&[good()]);
        tail.extend_from_slice(&[0; 7]);
        assert!(
            map_of(tail, 0).is_ok(),
            "a trailing remainder under 8 bytes"
        );

        let mut overrun = file(&[good()]);
        overrun.extend_from_slice(&1000u32.to_be_bytes());
        overrun.extend_from_slice(b"mdat");
        overrun.extend_from_slice(&[0; 10]);
        assert!(map_of(overrun, 0).is_ok(), "an mdat clamped to the file");

        let mut to_end = file(&[good()]);
        to_end.extend_from_slice(&0u32.to_be_bytes());
        to_end.extend_from_slice(b"mdat");
        to_end.extend_from_slice(&[0; 10]);
        assert!(map_of(to_end, 0).is_ok(), "size 0 at the top level");
    }

    #[test]
    fn malformed_boxes_end_safely() {
        let good = || {
            moov(
                1000,
                0,
                &[trak_spec(1, 48000, Some(vec![(500, 0, 1, 0)]))],
                &[],
            )
        };

        // Truncated: the moov claims more than the file holds.
        let mut truncated = file(&[good()]);
        truncated.truncate(truncated.len() - 3);
        malformed(map_of(truncated, 0));

        // A child overruns its parent.
        let mut body = header_box(b"mvhd", 0, 1000);
        body.extend_from_slice(&100u32.to_be_bytes());
        body.extend_from_slice(b"trak");
        body.extend_from_slice(&[0; 8]);
        malformed(map_of(file(&[bx(b"moov", &body)]), 0));

        // A size below its header.
        let mut body = header_box(b"mvhd", 0, 1000);
        body.extend_from_slice(&4u32.to_be_bytes());
        body.extend_from_slice(b"trak");
        malformed(map_of(file(&[bx(b"moov", &body)]), 0));
        let mut top = file(&[]);
        top.extend_from_slice(&7u32.to_be_bytes());
        top.extend_from_slice(b"free");
        malformed(map_of(top, 0));

        // A truncated header inside a container.
        let mut body = header_box(b"mvhd", 0, 1000);
        body.extend_from_slice(&[0; 5]);
        malformed(map_of(file(&[bx(b"moov", &body)]), 0));

        // A nested size of 0.
        let mut body = header_box(b"mvhd", 0, 1000);
        body.extend_from_slice(&0u32.to_be_bytes());
        body.extend_from_slice(b"trak");
        malformed(map_of(file(&[bx(b"moov", &body)]), 0));

        // An edit list claiming more entries than it holds.
        let mut list = elst(0, &[(500, 0, 1, 0)]);
        list[12..16].copy_from_slice(&2u32.to_be_bytes());
        let mut trak_body = header_box(b"tkhd", 0, 1);
        trak_body.extend(bx(b"edts", &list));
        trak_body.extend(bx(b"mdia", &header_box(b"mdhd", 0, 48000)));
        let mut moov_body = header_box(b"mvhd", 0, 1000);
        moov_body.extend(bx(b"trak", &trak_body));
        malformed(map_of(file(&[bx(b"moov", &moov_body)]), 0));

        // A full box too short for its field.
        let mut moov_body = full(b"mvhd", 0, &[0; 4]);
        moov_body.extend(trak(&trak_spec(1, 48000, None)));
        malformed(map_of(file(&[bx(b"moov", &moov_body)]), 0));
    }

    #[test]
    fn structural_errors_are_malformed() {
        let plain = || trak_spec(1, 48000, None);
        let single = |traks: &[TrakSpec]| moov(1000, 0, traks, &[]);

        malformed(map_of(file(&[single(&[plain()]), single(&[plain()])]), 0));
        malformed(map_of(file(&[mdat()]), 0));
        malformed(map_of(file(&[single(&[plain()])]), 1));
        malformed(map_of(file(&[single(&[trak_spec(1, 0, None)])]), 0));
        malformed(map_of(file(&[moov(1000, 2, &[plain()], &[])]), 0));
        malformed(map_of(
            file(&[moov(
                0,
                0,
                &[trak_spec(1, 48000, Some(vec![(5, 0, 1, 0)]))],
                &[],
            )]),
            0,
        ));
        assert_eq!(
            mapped(file(&[moov(0, 0, &[plain()], &[])]), 0).movie_timescale,
            1,
            "a zero movie timescale without edits is stored as 1"
        );

        let trak_with = |extra: &[u8], tkhd: bool, mdhd: bool| {
            let mut body = Vec::new();
            if tkhd {
                body.extend(header_box(b"tkhd", 0, 1));
            }
            if mdhd {
                body.extend(bx(b"mdia", &header_box(b"mdhd", 0, 48000)));
            }
            body.extend_from_slice(extra);
            let mut moov_body = header_box(b"mvhd", 0, 1000);
            moov_body.extend(bx(b"trak", &body));
            file(&[bx(b"moov", &moov_body)])
        };
        malformed(map_of(trak_with(&[], false, true), 0));
        malformed(map_of(trak_with(&[], true, false), 0));
        malformed(map_of(trak_with(&header_box(b"tkhd", 0, 2), true, true), 0));
        malformed(map_of(trak_with(&bx(b"mdia", &[]), true, true), 0));
        let edts = bx(b"edts", &elst(0, &[]));
        let mut two_edts = edts.clone();
        two_edts.extend(edts);
        malformed(map_of(trak_with(&two_edts, true, true), 0));
        let mut two_elst = elst(0, &[]);
        two_elst.extend(elst(0, &[]));
        malformed(map_of(trak_with(&bx(b"edts", &two_elst), true, true), 0));
        let mut two_mdhd = header_box(b"mdhd", 0, 48000);
        two_mdhd.extend(header_box(b"mdhd", 0, 48000));
        let mut body = header_box(b"tkhd", 0, 1);
        body.extend(bx(b"mdia", &two_mdhd));
        let mut moov_body = header_box(b"mvhd", 0, 1000);
        moov_body.extend(bx(b"trak", &body));
        malformed(map_of(file(&[bx(b"moov", &moov_body)]), 0));

        let mut moov_body = header_box(b"mvhd", 0, 1000);
        moov_body.extend(header_box(b"mvhd", 0, 1000));
        moov_body.extend(trak(&plain()));
        malformed(map_of(file(&[bx(b"moov", &moov_body)]), 0));
        let no_mvhd = bx(b"moov", &trak(&plain()));
        malformed(map_of(file(&[no_mvhd]), 0));

        // An unknown tfdt version.
        let mut traf = full(b"tfhd", 0, &1u32.to_be_bytes());
        traf.extend(full(b"tfdt", 2, &[0; 8]));
        let bytes = file(&[
            moov(1000, 0, &[plain()], &bx(b"mvex", &[])),
            bx(b"moof", &bx(b"traf", &traf)),
        ]);
        malformed(map_of(bytes, 0));
    }

    fn limited(bytes: Vec<u8>, limits: Limits) -> Result<Option<EditMap>, Mp4TimingError> {
        edit_map_with(&mut Cursor::new(bytes), 0, limits)
    }

    fn fillers(count: usize) -> Vec<u8> {
        (0..count).flat_map(|_| bx(b"free", &[])).collect()
    }

    #[test]
    fn each_parsing_limit_is_enforced() {
        let small = Limits {
            boxes_per_container: 10,
            boxes_total: 20,
            traks: 3,
            elst_entries: 4,
        };
        let plain = || trak_spec(1, 48000, None);

        // Per container: 1 mvhd + 1 trak + 8 fillers fits; one more does not.
        let fits = file(&[moov(1000, 0, &[plain()], &fillers(8))]);
        assert!(limited(fits, small).is_ok());
        let over = file(&[moov(1000, 0, &[plain()], &fillers(9))]);
        assert_eq!(
            malformed(limited(over, small)),
            "too many boxes in one container"
        );

        // In total, with every container under its own limit: 10 at the top
        // level, 10 in moov, 2 in trak and 1 in mdia.
        let mut parts = vec![fillers(8)];
        parts.push(moov(1000, 0, &[plain()], &fillers(8)));
        let total = file(&parts);
        assert_eq!(malformed(limited(total, small)), "too many boxes");

        // Tracks.
        let three = file(&[moov(1000, 0, &[plain(), plain(), plain()], &[])]);
        assert!(limited(three, small).is_ok());
        let four = file(&[moov(1000, 0, &[plain(), plain(), plain(), plain()], &[])]);
        assert_eq!(malformed(limited(four, small)), "too many tracks");

        // Edit list entries, even when the box holds them all.
        let many = |count: usize| {
            let mut edits = vec![(1, -1, 1, 0); count - 1];
            edits.push((5, 0, 1, 0));
            file(&[moov(1000, 0, &[trak_spec(1, 48000, Some(edits))], &[])])
        };
        assert!(limited(many(4), small).is_ok());
        assert_eq!(
            malformed(limited(many(5), small)),
            "too many edit list entries"
        );
    }

    #[test]
    fn the_production_limits_hold_at_their_edges() {
        let many = |count: usize| {
            let mut edits = vec![(1, -1, 1, 0); count - 1];
            edits.push((5, 0, 1, 0));
            file(&[moov(1000, 0, &[trak_spec(1, 48000, Some(edits))], &[])])
        };
        assert_eq!(mapped(many(1024), 0).empty_ticks, 1023);
        malformed(map_of(many(1025), 0));

        let plain = || trak_spec(1, 48000, None);
        let over = file(&[moov(1000, 0, &[plain()], &fillers(99_999))]);
        assert_eq!(
            malformed(map_of(over, 0)),
            "too many boxes in one container"
        );
    }
}
