import type { MatchOperationDto, MatchPlanDto } from "../../types/ipc";

/** Confidence strictly below this needs review. From the design document. */
export const LOW_CONFIDENCE_THRESHOLD = 80;
/** Segments in the confidence meter. */
export const METER_SEGMENTS = 5;

export type ReviewFilter = "all" | "needsReview" | "unmatched";
export const REVIEW_FILTERS: readonly ReviewFilter[] = ["all", "needsReview", "unmatched"];

export type LedgerRow =
  | {
      kind: "pair";
      key: string;
      videoIndex: number;
      videoName: string;
      showVideoName: boolean;
      low: boolean;
      operation: MatchOperationDto;
    }
  | { kind: "unmatchedVideo"; key: string; name: string }
  | { kind: "unmatchedSubtitle"; key: string; name: string };

/**
 * Marks each pairing whose predecessor among the given rows belongs to another
 * video, so a repeated video name is shown once per run of rows.
 */
function withVideoNames(rows: LedgerRow[]): LedgerRow[] {
  let previousVideo: number | undefined;
  return rows.map((row) => {
    if (row.kind !== "pair") return row;
    const showVideoName = row.videoIndex !== previousVideo;
    previousVideo = row.videoIndex;
    return row.showVideoName === showVideoName ? row : { ...row, showVideoName };
  });
}

/**
 * Pairings in `plan.videos` order then `matches` order, then unmatched videos,
 * then unmatched subtitles. Never sorts: plan order is the order a person
 * scans their library in, and confidence is called out per row instead.
 */
export function buildLedger(plan: MatchPlanDto): LedgerRow[] {
  const rows: LedgerRow[] = [];
  plan.videos.forEach((video, videoIndex) => {
    for (const operation of video.matches) {
      rows.push({
        kind: "pair",
        key: `pair-${operation.id}`,
        videoIndex,
        videoName: video.videoName,
        showVideoName: true,
        low: operation.confidence < LOW_CONFIDENCE_THRESHOLD,
        operation,
      });
    }
  });
  plan.unmatchedVideos.forEach((name, index) => {
    rows.push({ kind: "unmatchedVideo", key: `video-${index}`, name });
  });
  plan.unmatchedSubtitles.forEach((name, index) => {
    rows.push({ kind: "unmatchedSubtitle", key: `subtitle-${index}`, name });
  });
  return withVideoNames(rows);
}

function keeps(row: LedgerRow, filter: ReviewFilter): boolean {
  if (filter === "needsReview") return row.kind === "pair" && row.low;
  if (filter === "unmatched") return row.kind !== "pair";
  return true;
}

/**
 * `all` keeps everything; `needsReview` keeps low pairings; `unmatched` keeps
 * the two unmatched kinds. `showVideoName` is recomputed over the kept rows, so
 * a video's second pairing shown on its own still names its video.
 */
export function filterLedger(rows: readonly LedgerRow[], filter: ReviewFilter): LedgerRow[] {
  return withVideoNames(rows.filter((row) => keeps(row, filter)));
}

/** all = pairings; needsReview = low pairings; unmatched = unmatched videos + unmatched subtitles. */
export function ledgerCounts(rows: readonly LedgerRow[]): Record<ReviewFilter, number> {
  const counts: Record<ReviewFilter, number> = { all: 0, needsReview: 0, unmatched: 0 };
  for (const row of rows) {
    if (row.kind === "pair") {
      counts.all += 1;
      if (row.low) counts.needsReview += 1;
    } else {
      counts.unmatched += 1;
    }
  }
  return counts;
}

/** Filled meter segments for a 0–100 confidence, clamped to 0…METER_SEGMENTS. */
export function meterSegments(confidence: number): number {
  return Math.min(METER_SEGMENTS, Math.max(0, Math.round(confidence / 20)));
}
