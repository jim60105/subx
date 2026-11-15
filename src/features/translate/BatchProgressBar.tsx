import type { TranslateStage } from "../../types/ipc";
import "./BatchProgressBar.css";

export type SegmentState = "empty" | "inflight" | "resend" | "done";

interface BatchProgressBarProps {
  totalCues: number;
  batchSize: number;
  batchTotal: number;
  batchesDone: number;
  batchInFlight: number;
  resend: boolean;
  stage: TranslateStage | null;
}

/**
 * One segment per batch of the initial pass, each as wide as its share of the
 * file's cues (design D8). It changes only when a snapshot arrives; nothing
 * here interpolates. Hidden from assistive technology: the status line above
 * carries the same facts in words.
 */
export function BatchProgressBar({
  totalCues,
  batchSize,
  batchTotal,
  batchesDone,
  batchInFlight,
  resend,
  stage,
}: BatchProgressBarProps) {
  const segments = Array.from({ length: batchTotal }, (_, index) => {
    const isLast = index === batchTotal - 1;
    // The last batch holds what is left; at least 1 so a stale cue count
    // never collapses or inverts it.
    const cues = isLast ? Math.max(1, totalCues - (batchTotal - 1) * batchSize) : batchSize;
    let state: SegmentState = "empty";
    if (index < batchesDone) state = "done";
    else if (stage === "translating" && index + 1 === batchInFlight) state = resend ? "resend" : "inflight";
    return { cues, state };
  });

  return (
    <div className="batch-bar" aria-hidden="true">
      {segments.map(({ cues, state }, index) => (
        <span key={index} className="batch-bar__segment" data-state={state} style={{ flexGrow: cues }} />
      ))}
    </div>
  );
}
