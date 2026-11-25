import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { PreviewCueDto } from "../../types/ipc";
import { RULE_PX_PER_SECOND, visibleCues } from "./cueTiming";
import "./TimeRule.css";

interface TimeRuleProps {
  cues: readonly PreviewCueDto[];
  positionMs: number;
  offsetMs: number;
}

/** The half window used while the rule has no width to measure, as in jsdom. */
const FALLBACK_HALF_WINDOW_MS = 10_000;

function px(ms: number): number {
  return (ms / 1000) * RULE_PX_PER_SECOND;
}

/**
 * The real cues scrolling past a fixed needle: hollow bars at the original
 * times, solid bars at the shifted times, the cue shown at the position marked.
 *
 * Bars sit on a belt that moves with the position, so their own `left` changes
 * only when the offset does, and only that is animated. Drawn from cue times
 * alone; no audio data. Hidden from assistive technology and inert to the
 * pointer: the offset field carries the same information.
 */
export function TimeRule({ cues, positionMs, offsetMs }: TimeRuleProps) {
  const { t } = useTranslation("sync");
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    setWidth(root.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(root.clientWidth));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const halfWindowMs = width > 0 ? (width / 2 / RULE_PX_PER_SECOND) * 1000 : FALLBACK_HALF_WINDOW_MS;
  const visible = visibleCues(cues, positionMs, offsetMs, halfWindowMs);

  // One tick per whole second in the window; media time starts at zero.
  const firstSecond = Math.max(0, Math.ceil((positionMs - halfWindowMs) / 1000));
  const lastSecond = Math.floor((positionMs + halfWindowMs) / 1000);
  const ticks: number[] = [];
  for (let second = firstSecond; second <= lastSecond; second += 1) ticks.push(second);

  return (
    <div ref={rootRef} className="time-rule" aria-hidden="true">
      <div className="time-rule__belt" style={{ transform: `translateX(${-px(positionMs)}px)` }}>
        {ticks.map((second) => (
          <span key={`tick-${second}`} className="time-rule__tick" style={{ left: `${px(second * 1000)}px` }} />
        ))}
        {visible.map((cue) => (
          <span
            key={`original-${cue.index}`}
            className="time-rule__bar"
            data-row="original"
            style={{ left: `${px(cue.startMs)}px`, width: `${px(cue.endMs - cue.startMs)}px` }}
          />
        ))}
        {visible
          .filter((cue) => cue.shiftedEndMs > cue.shiftedStartMs)
          .map((cue) => (
            <span
              key={`shifted-${cue.index}`}
              className="time-rule__bar"
              data-row="shifted"
              data-active={cue.active ? "true" : undefined}
              style={{
                left: `${px(cue.shiftedStartMs)}px`,
                width: `${px(cue.shiftedEndMs - cue.shiftedStartMs)}px`,
              }}
            />
          ))}
      </div>
      <span className="time-rule__label" data-row="original">
        {t("offset.preview.original")}
      </span>
      <span className="time-rule__label" data-row="shifted">
        {t("offset.preview.shifted")}
      </span>
      <span className="time-rule__needle" />
    </div>
  );
}
