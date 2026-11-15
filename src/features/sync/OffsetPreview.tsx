import { useTranslation } from "react-i18next";

import "./OffsetPreview.css";

/** Schematic cue positions as [start %, end %]. Fixed; unrelated to the real subtitle. */
export const PREVIEW_CUES: readonly (readonly [number, number])[] = [
  [8, 22],
  [34, 46],
  [58, 76],
  [86, 94],
];

/** The shifted row moves 1 % of the track per this many milliseconds… */
export const PREVIEW_MS_PER_PERCENT = 100;

/** …and saturates at this many percent in either direction. */
export const PREVIEW_MAX_SHIFT = 6;

/** How far, in percent of the track, the shifted row sits from the original. */
export function previewShift(offsetMs: number): number {
  const shift = offsetMs / PREVIEW_MS_PER_PERCENT;
  return Math.min(PREVIEW_MAX_SHIFT, Math.max(-PREVIEW_MAX_SHIFT, shift));
}

function direction(offsetMs: number): "later" | "earlier" | "none" {
  if (offsetMs > 0) return "later";
  if (offsetMs < 0) return "earlier";
  return "none";
}

/**
 * Two rows of cue bars that show which way the offset moves the subtitle.
 *
 * Purely schematic: no audio data crosses IPC, so nothing here is drawn from
 * the real file. The whole preview is hidden from assistive technology; the
 * sentence explaining the sign stays available as the offset field's hint.
 */
export function OffsetPreview({ offsetMs }: { offsetMs: number }) {
  const { t } = useTranslation("sync");
  const shift = previewShift(offsetMs);

  return (
    <div className="offset-preview" aria-hidden="true" data-direction={direction(offsetMs)}>
      <div className="offset-preview__lane">
        <span className="offset-preview__label">{t("offset.preview.original")}</span>
        <div className="offset-preview__track">
          {PREVIEW_CUES.map(([start, end]) => (
            <span
              key={start}
              className="offset-preview__cue"
              data-row="original"
              style={{ left: `${start}%`, width: `${end - start}%` }}
            />
          ))}
        </div>
      </div>
      <div className="offset-preview__lane">
        <span className="offset-preview__label">{t("offset.preview.shifted")}</span>
        <div className="offset-preview__track">
          {PREVIEW_CUES.map(([start, end]) => (
            <span
              key={start}
              className="offset-preview__cue"
              data-row="shifted"
              style={{ left: `${start + shift}%`, width: `${end - start}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
