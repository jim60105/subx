import { useEffect, useState } from "react";

import { usePrefersReducedMotion } from "../../theme/usePrefersReducedMotion";
import type { MatchStage } from "../../types/ipc";
import "./AnalysisIllustration.css";

export const VIDEO_BARS = 6;
export const SUBTITLE_BARS = 8;
/** [videoIndex, subtitleIndex] of the pairs the illustration settles. Fixed; unrelated to real data. */
export const PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [2, 3],
  [3, 2],
  [4, 5],
  [5, 6],
];
/** Trial curves drawn before each pair settles. */
export const TRIALS_PER_PAIR = 3;
/** Milliseconds after which the pairing sequence replays while the stage is `analyzing`. */
export const LOOM_CYCLE_MS = 7200;

/** Ticks one pair takes: its trials, then the settled curve. */
const TICKS_PER_PAIR = TRIALS_PER_PAIR + 1;
const SUBTITLE_WIDTHS = [150, 120, 165, 135, 150, 110, 160, 125];
const HOLES_PER_ROW = 9;
const PAIRED_SUBTITLES = new Set(PAIRS.map(([, subtitle]) => subtitle));

const videoY = (index: number) => 40 + 44 * index;
const subtitleY = (index: number) => 26 + 36 * index;

function curve(video: number, subtitle: number): string {
  const vy = videoY(video) + 9;
  const sy = subtitleY(subtitle) + 6;
  return `M210 ${vy} C 280 ${vy}, 300 ${sy}, 370 ${sy}`;
}

/** The subtitle a trial of pair `n` reaches for: never the pair's own subtitle. */
function trialTarget(pair: number, trial: number): number {
  return (PAIRS[pair][1] + 1 + ((pair * 3 + trial * 5) % (SUBTITLE_BARS - 1))) % SUBTITLE_BARS;
}

const delay = (token: string, steps: number) => ({ animationDelay: `calc(var(${token}) * ${steps})` });

/**
 * Step 2's decorative loom: film-strip bars for videos, subtitle bars, and
 * curves that try and settle pairings.
 *
 * `MatchProgress` carries only the stage, so nothing here is data: the shape
 * counts are fixed, there is no text, and the whole drawing is hidden from
 * assistive technology. Under reduced motion it is a static drawing that is
 * identical in every stage, and no timer runs.
 */
export function AnalysisIllustration({ stage }: { stage: MatchStage | null }) {
  const reduced = usePrefersReducedMotion();
  const animated = !reduced;
  const current = stage ?? "scanning";
  const replaying = animated && current === "analyzing";
  const [cycle, setCycle] = useState(0);

  // The one timer: replays the pairing sequence while analysis lasts. Re-keying
  // the curves group below restarts every curve's CSS animation.
  useEffect(() => {
    if (!replaying) return;
    const id = window.setInterval(() => setCycle((value) => value + 1), LOOM_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [replaying]);

  const finalizing = animated && current === "finalizing";

  return (
    <svg
      className="analysis-loom"
      viewBox="0 0 600 330"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      data-motion={animated ? "animated" : "static"}
      data-stage={animated ? current : undefined}
    >
      {Array.from({ length: VIDEO_BARS }, (_, index) => {
        const y = videoY(index);
        return (
          <g key={index} className="analysis-loom__video" style={animated ? delay("--motion-stagger", index) : undefined}>
            <rect x={60} y={y} width={150} height={18} />
            {Array.from({ length: HOLES_PER_ROW * 2 }, (_, hole) => (
              <rect
                key={hole}
                className="analysis-loom__hole"
                x={66 + 16 * (hole % HOLES_PER_ROW)}
                y={hole < HOLES_PER_ROW ? y + 3 : y + 12}
                width={8}
                height={3}
              />
            ))}
          </g>
        );
      })}
      {SUBTITLE_WIDTHS.map((width, index) => {
        const y = subtitleY(index);
        return (
          <g
            key={index}
            className="analysis-loom__subtitle"
            style={animated ? delay("--motion-stagger", index) : undefined}
            data-orphan={finalizing && !PAIRED_SUBTITLES.has(index) ? "true" : undefined}
          >
            <rect x={370} y={y} width={width} height={5} />
            <rect x={370} y={y + 8} width={width * 0.6} height={5} />
          </g>
        );
      })}
      {replaying && (
        <g key={cycle} className="analysis-loom__curves" data-cycle={cycle}>
          {PAIRS.map(([video, subtitle], pair) => (
            <g key={pair}>
              {Array.from({ length: TRIALS_PER_PAIR }, (_, trial) => (
                <path
                  key={trial}
                  className="analysis-loom__trial"
                  d={curve(video, trialTarget(pair, trial))}
                  style={delay("--motion-loom-tick", pair * TICKS_PER_PAIR + trial)}
                />
              ))}
              <path
                className="analysis-loom__settled"
                d={curve(video, subtitle)}
                style={delay("--motion-loom-tick", pair * TICKS_PER_PAIR + TRIALS_PER_PAIR)}
              />
            </g>
          ))}
        </g>
      )}
      {finalizing && (
        <g className="analysis-loom__curves">
          {PAIRS.map(([video, subtitle], pair) => (
            <path key={pair} className="analysis-loom__settled" data-final="true" d={curve(video, subtitle)} />
          ))}
        </g>
      )}
    </svg>
  );
}
