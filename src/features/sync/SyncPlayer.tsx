import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import { plainCueText } from "./cueText";
import { activeCues } from "./cueTiming";
import type { PreviewSession } from "./usePreviewSession";
import "./SyncPlayer.css";

interface SyncPlayerProps {
  session: PreviewSession;
  offsetMs: number;
  /** Called with the media position whenever the player reads it. */
  onPosition?: (positionMs: number) => void;
}

/** Where to pick up after the element's source changes. */
interface Resume {
  time: number;
  playing: boolean;
  volume: number;
}

/** Static heights of the audio mark's bars, as fractions. Decorative; no audio data. */
const AUDIO_MARK_BARS = [0.35, 0.6, 0.85, 0.5, 0.7, 1, 0.55, 0.8, 0.4, 0.65, 0.9, 0.45, 0.75, 0.3];

/** `m:ss.d`, or `h:mm:ss.d` from one hour; anything unknown reads as zero. */
export function formatMediaTime(seconds: number): string {
  const tenths = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds * 10) : 0;
  const fraction = tenths % 10;
  const whole = Math.floor(tenths / 10);
  const secs = String(whole % 60).padStart(2, "0");
  const minutes = Math.floor(whole / 60) % 60;
  const hours = Math.floor(whole / 3600);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${secs}.${fraction}`;
  return `${minutes}:${secs}.${fraction}`;
}

function snapshot(video: HTMLVideoElement): Resume {
  return { time: video.currentTime, playing: !video.paused, volume: video.volume };
}

/**
 * The offset step's player: one media element, the shifted subtitle over it,
 * and a transport.
 *
 * The offset is applied here, per render, from the position the element
 * reports, so changing it never reloads, seeks or pauses the media. Frames are
 * requested only while playing; anything else that moves the position reads it
 * once. There are no global shortcuts: Space keeps its native meaning on the
 * focused control.
 */
export function SyncPlayer({ session, offsetMs, onPosition }: SyncPlayerProps) {
  const { t } = useTranslation("sync");
  const { media, cues } = session;

  // The last URL the element was given. It is kept through `preparing` and
  // `unavailable`, so the picture stays until the audio is ready and the
  // element keeps its place behind an error.
  const lastUrlRef = useRef<string | null>(null);
  if (media.status === "video" || media.status === "audio") lastUrlRef.current = media.url;
  else if (media.status === "none" || media.status === "opening") lastUrlRef.current = null;
  const lastUrl = lastUrlRef.current;

  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<number | null>(null);
  const resumeRef = useRef<Resume | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  const [positionMs, setPositionMs] = useState(0);
  const [duration, setDuration] = useState(Number.NaN);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [hasPicture, setHasPicture] = useState(true);

  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  const readPosition = useCallback(() => {
    const video = videoRef.current;
    if (video === null) return;
    const ms = video.currentTime * 1000;
    setPositionMs(ms);
    onPositionRef.current?.(ms);
  }, []);

  const stopFrames = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const startFrames = useCallback(() => {
    if (frameRef.current !== null) return;
    const tick = () => {
      readPosition();
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [readPosition]);

  useEffect(() => stopFrames, [stopFrames]);

  // Source and state transitions, done imperatively so the element's place can
  // be read before a new source starts loading and resets it.
  useLayoutEffect(() => {
    const entering = prevStatusRef.current !== media.status;
    prevStatusRef.current = media.status;
    const video = videoRef.current;
    if (video === null) {
      resumeRef.current = null;
      return;
    }

    if (media.status === "preparing" && entering) {
      resumeRef.current = snapshot(video);
      video.pause();
      stopFrames();
      setPlaying(false);
    }

    const target = lastUrl === "" ? null : lastUrl;
    const shown = video.getAttribute("src");
    if (shown !== target) {
      if (shown !== null) {
        // Without a capture from `preparing`, this is the element's own place:
        // after a failed audio playback, wherever the audio stopped (0 if it
        // never loaded), which is where returning to the video resumes.
        const resume = resumeRef.current ?? snapshot(video);
        // Returning to the video stays paused; continuing in audio keeps playing.
        resumeRef.current = media.status === "video" ? { ...resume, playing: false } : resume;
      } else {
        resumeRef.current = null;
      }
      // Until the new source reports its own place, cues must not be matched
      // against the old one's.
      if (resumeRef.current === null) setPositionMs(0);
      stopFrames();
      setPlaying(false);
      setHasPicture(true);
      setDuration(Number.NaN);
      if (target === null) video.removeAttribute("src");
      else video.setAttribute("src", target);
    } else if (media.status === "video" && entering) {
      // Back on the same element, which kept its place: nothing to restore.
      resumeRef.current = null;
    }
  }, [media.status, lastUrl, stopFrames]);

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (video === null) return;
    setDuration(video.duration);
    setHasPicture(video.videoWidth > 0);
    const resume = resumeRef.current;
    resumeRef.current = null;
    if (resume !== null) {
      video.currentTime = Number.isFinite(video.duration) ? Math.min(resume.time, video.duration) : resume.time;
      video.volume = resume.volume;
      if (resume.playing) {
        // A refused play leaves the control paused; decoding failures arrive
        // as `error` events.
        void Promise.resolve(video.play()).catch(() => setPlaying(!video.paused));
      }
    }
    setVolume(video.volume);
    readPosition();
  };

  const onPlay = () => {
    setPlaying(true);
    startFrames();
  };

  const onStop = () => {
    setPlaying(false);
    stopFrames();
    readPosition();
  };

  const onError = () => {
    const video = videoRef.current;
    if (video === null || !video.getAttribute("src")) return;
    stopFrames();
    setPlaying(false);
    // The place captured for a pending audio switch survives a late failure of
    // the picture it was captured from; any other stale place does not.
    if (media.status !== "preparing") resumeRef.current = null;
    session.onMediaError();
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (video === null) return;
    if (playing) {
      video.pause();
    } else {
      void Promise.resolve(video.play()).catch(() => setPlaying(!video.paused));
    }
  };

  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (video === null) return;
    video.currentTime = seconds;
    setPositionMs(seconds * 1000);
    onPositionRef.current?.(seconds * 1000);
  };

  const changeVolume = (next: number) => {
    const video = videoRef.current;
    if (video === null) return;
    video.volume = next;
    setVolume(next);
  };

  const playable = media.status === "video" || media.status === "audio";
  // Not while preparing: the element is paused and the band says why.
  const lines = playable
    ? activeCues(cues, positionMs, offsetMs)
        .map((cue) => ({ cue, text: plainCueText(cue.text) }))
        .filter(({ text }) => text !== "")
    : [];
  const showAudioMark =
    media.status === "audio" || (media.status === "video" && !hasPicture);
  const durationKnown = Number.isFinite(duration);
  const positionText = formatMediaTime(positionMs / 1000);

  return (
    <div className="sync-player" data-status={media.status}>
      <div className="sync-player__stage">
        {lastUrl !== null && (
          <video
            ref={videoRef}
            className="sync-player__video"
            preload="metadata"
            onLoadedMetadata={onLoadedMetadata}
            onDurationChange={() => setDuration(videoRef.current?.duration ?? Number.NaN)}
            onPlay={onPlay}
            onPlaying={onPlay}
            onPause={onStop}
            onEnded={onStop}
            onSeeked={readPosition}
            onTimeUpdate={() => {
              if (videoRef.current?.paused) readPosition();
            }}
            onVolumeChange={() => setVolume(videoRef.current?.volume ?? 1)}
            onError={onError}
          />
        )}

        {showAudioMark && (
          <div className="sync-player__audio-mark" aria-hidden="true">
            {AUDIO_MARK_BARS.map((height, index) => (
              <span
                key={index}
                className="sync-player__audio-bar"
                style={{ height: `${height * 100}%` }}
              />
            ))}
          </div>
        )}

        {lines.length > 0 && (
          <div className="sync-player__slip">
            {lines.map(({ cue, text }, index) => (
              <span key={`${cue.startMs}:${cue.endMs}:${index}`} className="sync-player__line">
                {text}
              </span>
            ))}
          </div>
        )}

        {media.status === "none" && (
          <div className="sync-player__message">
            <p className="sync-player__message-title">{t("preview.none.title")}</p>
            <p className="sync-player__message-text">{t("preview.none.description")}</p>
          </div>
        )}
        {media.status === "opening" && (
          <div className="sync-player__message">
            <p className="sync-player__message-text">{t("preview.opening")}</p>
          </div>
        )}
        {media.status === "preparing" && (
          <div className="sync-player__band" role="status">
            {t(`preview.preparing.${media.reason}`)}
          </div>
        )}
        {media.status === "unavailable" && (
          <div className="sync-player__message sync-player__message--cover">
            <p className="sync-player__message-title">{t("preview.unavailable.title")}</p>
            <ErrorNotice error={media.error} role="status" />
            {media.canReturn && (
              <button type="button" className="button" onClick={session.returnToVideo}>
                {t("preview.backToVideo")}
              </button>
            )}
          </div>
        )}
      </div>

      {playable && (
        <div className="sync-player__transport">
          <button type="button" className="button sync-player__play" onClick={togglePlay}>
            {playing ? t("preview.pause") : t("preview.play")}
          </button>
          <span className="sync-player__time">
            {positionText} / {formatMediaTime(duration)}
          </span>
          <input
            type="range"
            className="sync-player__seek"
            aria-label={t("preview.seek")}
            aria-valuetext={positionText}
            min={0}
            max={durationKnown ? duration : 0}
            step={0.1}
            value={positionMs / 1000}
            disabled={!durationKnown}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <input
            type="range"
            className="sync-player__volume"
            aria-label={t("preview.volume")}
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => changeVolume(Number(event.target.value))}
          />
          {media.status === "video" && (
            <button type="button" className="button button--tertiary" onClick={session.requestAudio}>
              {t("preview.noSound")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
