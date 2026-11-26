import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { i18n, setupI18n } from "../../test/renderWithI18n";
import type { PreviewCueDto } from "../../types/ipc";
import { SyncOffsetView } from "./SyncOffsetStep";
import { formatMediaTime, SyncPlayer } from "./SyncPlayer";
import type { PreviewMedia, PreviewSession } from "./usePreviewSession";

const VIDEO_URL = "http://127.0.0.1:9/s1";
const AUDIO_URL = "http://127.0.0.1:9/s1/audio";
const PREVIEW_ERROR = { code: "preview.media_unreadable", message: "x", hintCode: null };
const CUES: PreviewCueDto[] = [
  { startMs: 5_000, endMs: 7_000, text: "{\\an8}<i>first</i>" },
  { startMs: 11_000, endMs: 14_000, text: "second" },
];

function makeSession(media: PreviewMedia, cues: readonly PreviewCueDto[] = CUES): PreviewSession {
  return {
    media,
    cues,
    cueError: undefined,
    onMediaError: vi.fn(),
    requestAudio: vi.fn(),
    returnToVideo: vi.fn(),
  };
}

/** The media element's state, which jsdom does not implement. */
interface MediaState {
  currentTime: number;
  paused: boolean;
  duration: number;
  videoWidth: number;
  volume: number;
}

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
let frames: FrameRequestCallback[];
let requestFrame: ReturnType<typeof vi.spyOn>;
let cancelFrame: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await setupI18n("en");
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play as never);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause as never);
  frames = [];
  requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPlayer(session: PreviewSession, offsetMs = 0) {
  // A wrapper, so a rerender updates the same player instead of remounting it.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
  );
  const view = render(<SyncPlayer session={session} offsetMs={offsetMs} />, { wrapper });
  const rerender = (next: PreviewSession, nextOffset = offsetMs) =>
    view.rerender(<SyncPlayer session={next} offsetMs={nextOffset} />);
  return { ...view, rerender };
}

function video(): HTMLVideoElement {
  const element = document.querySelector("video");
  if (element === null) throw new Error("the player rendered no media element");
  return element;
}

/** Puts jsdom-less media state on the element and records `currentTime` writes. */
function stubMedia(element: HTMLVideoElement, initial: Partial<MediaState> = {}) {
  const state: MediaState = {
    currentTime: 0,
    paused: true,
    duration: 60,
    videoWidth: 640,
    volume: 1,
    ...initial,
  };
  const timeWrites = vi.fn();
  Object.defineProperty(element, "currentTime", {
    configurable: true,
    get: () => state.currentTime,
    set: (value: number) => {
      timeWrites(value);
      state.currentTime = value;
    },
  });
  Object.defineProperty(element, "volume", {
    configurable: true,
    get: () => state.volume,
    set: (value: number) => {
      state.volume = value;
    },
  });
  for (const key of ["paused", "duration", "videoWidth"] as const) {
    Object.defineProperty(element, key, { configurable: true, get: () => state[key] });
  }
  return { state, timeWrites };
}

/** Loads the element's metadata and starts it at `seconds`. */
function startPlaying(element: HTMLVideoElement, state: MediaState, seconds: number) {
  fireEvent.loadedMetadata(element);
  state.currentTime = seconds;
  state.paused = false;
  fireEvent.play(element);
}

function slipText(): string | null {
  return document.querySelector(".sync-player__slip")?.textContent ?? null;
}

describe("formatMediaTime", () => {
  it("shows tenths, and hours only from one hour", () => {
    expect(formatMediaTime(0)).toBe("0:00.0");
    expect(formatMediaTime(65.47)).toBe("1:05.4");
    expect(formatMediaTime(3_723.9)).toBe("1:02:03.9");
    expect(formatMediaTime(Number.NaN)).toBe("0:00.0");
  });
});

describe("the sync player", () => {
  // @covers sync-workflow/preview-playback-controls#player-starts-paused-and-unmuted
  it("starts paused and unmuted with a named play control", () => {
    renderPlayer(makeSession({ status: "video", url: VIDEO_URL }));
    const element = video();

    expect(element.getAttribute("src")).toBe(VIDEO_URL);
    expect(element.paused).toBe(true);
    expect(element.muted).toBe(false);
    expect(element.hasAttribute("autoplay")).toBe(false);
    expect(element.hasAttribute("controls")).toBe(false);
    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "Position" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();
  });

  it("shows position and duration and disables seeking until the duration is known", () => {
    renderPlayer(makeSession({ status: "video", url: VIDEO_URL }));
    const element = video();
    stubMedia(element, { duration: Number.POSITIVE_INFINITY });

    expect(screen.getByRole("slider", { name: "Position" })).toBeDisabled();
    fireEvent.loadedMetadata(element);
    expect(screen.getByRole("slider", { name: "Position" })).toBeDisabled();

    const { state } = stubMedia(element, { duration: 3_700, currentTime: 61.25 });
    fireEvent.durationChange(element);
    fireEvent.seeked(element);
    expect(state.duration).toBe(3_700);
    expect(screen.getByText("1:01.2 / 1:01:40.0")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Position" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "Position" })).toHaveAttribute("aria-valuetext", "1:01.2");
  });

  // @covers sync-workflow/cue-text-is-inert#markup-is-never-interpreted
  it("never interprets markup in cue text", () => {
    const cues = [
      { startMs: 0, endMs: 5_000, text: '<img src="x" onerror="window.hacked = 1">hi <b>there</b>' },
      { startMs: 0, endMs: 5_000, text: "<script>alert(1)</script>after" },
    ];
    renderPlayer(makeSession({ status: "video", url: VIDEO_URL }, cues));

    const slip = document.querySelector(".sync-player__slip");
    expect(slip).not.toBeNull();
    const elements = [...slip!.querySelectorAll("*")];
    expect(elements.every((element) => element.tagName === "SPAN" && element.children.length === 0)).toBe(true);
    expect(elements.map((element) => element.textContent)).toEqual(["hi there", "alert(1)after"]);
    expect(slip!.getAttribute("aria-live")).toBeNull();
  });

  it("shows the plain text of the cues active at the shifted position", () => {
    renderPlayer(makeSession({ status: "video", url: VIDEO_URL }), 0);
    const { state } = stubMedia(video());

    state.currentTime = 6;
    fireEvent.seeked(video());
    expect(slipText()).toBe("first");

    state.currentTime = 9;
    fireEvent.seeked(video());
    expect(slipText()).toBeNull();
  });

  it("forgets the old position when a new session's media replaces the old", () => {
    const { rerender } = renderPlayer(makeSession({ status: "video", url: VIDEO_URL }));
    const { state } = stubMedia(video());
    state.currentTime = 6;
    fireEvent.seeked(video());
    expect(slipText()).toBe("first");

    rerender(makeSession({ status: "opening" }));
    rerender(makeSession({ status: "video", url: "http://127.0.0.1:9/s2" }));

    expect(slipText()).toBeNull();
    expect(screen.getByText("0:00.0 / 0:00.0")).toBeInTheDocument();
  });

  // @covers sync-workflow/preview-media-states#user-switches-a-silent-video-to-audio
  it("continues a silent video in audio from the same place, playing, at the same volume", async () => {
    const user = userEvent.setup();
    const session = makeSession({ status: "video", url: VIDEO_URL });
    const { rerender } = renderPlayer(session);
    const element = video();
    const { state, timeWrites } = stubMedia(element, { volume: 0.5 });
    startPlaying(element, state, 12);

    await user.click(screen.getByRole("button", { name: "No sound?" }));
    expect(session.requestAudio).toHaveBeenCalledTimes(1);

    rerender(makeSession({ status: "preparing", reason: "requested" }));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(element.getAttribute("src")).toBe(VIDEO_URL);
    expect(screen.getByRole("status")).toHaveTextContent("Preparing the sound");
    expect(screen.queryByRole("button", { name: /Play|Pause/ })).toBeNull();

    // The audio element starts from scratch, as a new source does.
    state.paused = true;
    state.currentTime = 0;
    state.volume = 1;
    rerender(makeSession({ status: "audio", url: AUDIO_URL }));
    expect(video()).toBe(element);
    expect(element.getAttribute("src")).toBe(AUDIO_URL);
    expect(play).not.toHaveBeenCalled();

    fireEvent.loadedMetadata(element);
    expect(timeWrites).toHaveBeenLastCalledWith(12);
    expect(state.volume).toBe(0.5);
    expect(play).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".sync-player__audio-mark")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "No sound?" })).toBeNull();
  });

  // @covers sync-workflow/preview-media-states#failed-switch-can-return-to-video
  it("returns from a failed switch to the video at the same place, paused", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPlayer(makeSession({ status: "video", url: VIDEO_URL }));
    const element = video();
    const { state, timeWrites } = stubMedia(element);
    startPlaying(element, state, 12);

    rerender(makeSession({ status: "preparing", reason: "requested" }));
    state.paused = true;
    const failed = makeSession({
      status: "unavailable",
      error: { code: "preview.audio_unsupported", message: "no audio", hintCode: null },
      canReturn: true,
    });
    rerender(failed);
    expect(screen.getByText("The selected media has no audio the preview can play.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to video" }));
    expect(failed.returnToVideo).toHaveBeenCalledTimes(1);

    rerender(makeSession({ status: "video", url: VIDEO_URL }));
    fireEvent.loadedMetadata(element);
    expect(element.getAttribute("src")).toBe(VIDEO_URL);
    expect(element.currentTime).toBe(12);
    expect(timeWrites).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("returns from a failed audio playback to the video at the audio's place, paused", () => {
    const { rerender } = renderPlayer(makeSession({ status: "audio", url: AUDIO_URL }));
    const element = video();
    const { state, timeWrites } = stubMedia(element);
    startPlaying(element, state, 20);

    const session = makeSession({ status: "audio", url: AUDIO_URL });
    rerender(session);
    fireEvent.error(element);
    expect(session.onMediaError).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalled();

    rerender(
      makeSession({
        status: "unavailable",
        error: { code: "preview.media_unreadable", message: "x", hintCode: null },
        canReturn: true,
      }),
    );
    expect(screen.getByRole("button", { name: "Back to video" })).toBeInTheDocument();
    rerender(makeSession({ status: "video", url: VIDEO_URL }));
    expect(element.getAttribute("src")).toBe(VIDEO_URL);

    state.currentTime = 0;
    fireEvent.loadedMetadata(element);
    expect(timeWrites).toHaveBeenLastCalledWith(20);
    expect(play).not.toHaveBeenCalled();
  });

  it("offers no way back when the switch cannot return", () => {
    renderPlayer(
      makeSession({
        status: "unavailable",
        error: { code: "preview.server_unavailable", message: "x", hintCode: null },
        canReturn: false,
      }),
    );

    expect(screen.getByText("The preview is unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to video" })).toBeNull();
    expect(document.querySelector("video")).toBeNull();
  });

  // @covers sync-workflow/preview-media-states#sound-without-a-picture-is-not-an-error
  it("treats media without a picture as playable sound with the audio mark", () => {
    const session = makeSession({ status: "video", url: VIDEO_URL });
    renderPlayer(session);
    const element = video();
    stubMedia(element, { videoWidth: 0 });

    expect(document.querySelector(".sync-player__audio-mark")).toBeNull();
    fireEvent.loadedMetadata(element);

    expect(document.querySelector(".sync-player__audio-mark")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(session.onMediaError).not.toHaveBeenCalled();
  });

  it("reports a media failure, but ignores errors from an element without a source", () => {
    const session = makeSession({ status: "video", url: "" });
    renderPlayer(session);
    const element = video();

    expect(element.hasAttribute("src")).toBe(false);
    fireEvent.error(element);
    expect(session.onMediaError).not.toHaveBeenCalled();

    const withSource = makeSession({ status: "video", url: VIDEO_URL });
    const { rerender } = renderPlayer(withSource);
    rerender(withSource);
    const elements = document.querySelectorAll("video");
    fireEvent.error(elements[elements.length - 1]);
    expect(withSource.onMediaError).toHaveBeenCalledTimes(1);
  });

  it("plays and pauses from the transport, staying paused when play is refused", async () => {
    const user = userEvent.setup();
    renderPlayer(makeSession({ status: "video", url: VIDEO_URL }));
    const element = video();
    const { state } = stubMedia(element);

    play.mockImplementationOnce(() => Promise.reject(new DOMException("blocked", "NotAllowedError")));
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play" }));
    state.paused = false;
    fireEvent.play(element);
    const toggle = screen.getByRole("button", { name: "Pause" });
    expect(toggle).not.toHaveAttribute("aria-pressed");

    await user.click(toggle);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("sets the volume from the transport", () => {
    renderPlayer(makeSession({ status: "audio", url: AUDIO_URL }));
    const { state } = stubMedia(video());

    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "0.25" } });

    expect(state.volume).toBe(0.25);
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("0.25");
  });

  // @covers sync-workflow/preview-playback-controls#offset-change-does-not-disturb-playback
  it("follows an offset change while playing without touching the media", () => {
    const session = makeSession({ status: "video", url: VIDEO_URL });
    const { rerender } = renderPlayer(session, 0);
    const element = video();
    const { state, timeWrites } = stubMedia(element);
    startPlaying(element, state, 6);
    act(() => frames[frames.length - 1](0));
    expect(slipText()).toBe("first");

    rerender(session, -5_000);

    expect(slipText()).toBe("second");
    expect(element.getAttribute("src")).toBe(VIDEO_URL);
    expect(timeWrites).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  // @covers sync-workflow/preview-playback-controls#paused-redraw
  it("redraws a seek or an offset change while paused without requesting frames", () => {
    const session = makeSession({ status: "video", url: VIDEO_URL });
    const { rerender } = renderPlayer(session, 0);
    const element = video();
    const { timeWrites } = stubMedia(element);
    fireEvent.loadedMetadata(element);

    fireEvent.change(screen.getByRole("slider", { name: "Position" }), { target: { value: "6" } });
    expect(timeWrites).toHaveBeenLastCalledWith(6);
    expect(screen.getByText("0:06.0 / 1:00.0")).toBeInTheDocument();
    expect(slipText()).toBe("first");

    rerender(session, 5_500);
    expect(slipText()).toBeNull();
    rerender(session, -5_500);
    expect(slipText()).toBe("second");

    expect(requestFrame).not.toHaveBeenCalled();
  });

  it("reads the position on timeupdate only while paused", () => {
    renderPlayer(makeSession({ status: "video", url: VIDEO_URL }));
    const element = video();
    const { state } = stubMedia(element);

    state.currentTime = 6;
    fireEvent.timeUpdate(element);
    expect(slipText()).toBe("first");

    state.paused = false;
    state.currentTime = 12;
    fireEvent.timeUpdate(element);
    expect(slipText()).toBe("first");
  });

  // @covers sync-workflow/preview-playback-controls#frames-stop-with-playback
  it.each(["pause", "ended"] as const)("requests no frame once playback stops by %s", (event) => {
    renderPlayer(makeSession({ status: "video", url: VIDEO_URL }));
    const element = video();
    const { state } = stubMedia(element);
    startPlaying(element, state, 1);
    fireEvent.playing(element);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    act(() => frames[0](0));
    expect(requestFrame).toHaveBeenCalledTimes(2);

    state.paused = true;
    if (event === "pause") fireEvent.pause(element);
    else fireEvent.ended(element);

    expect(cancelFrame).toHaveBeenCalledWith(2);
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  // @covers sync-workflow/preview-playback-controls#frames-stop-with-playback
  it("requests no frame once the step is left", () => {
    const { unmount } = renderPlayer(makeSession({ status: "video", url: VIDEO_URL }));
    const element = video();
    const { state } = stubMedia(element);
    startPlaying(element, state, 1);

    unmount();

    expect(cancelFrame).toHaveBeenCalledWith(1);
  });

  it("adds no global keyboard shortcut", () => {
    renderPlayer(makeSession({ status: "video", url: VIDEO_URL }));
    stubMedia(video());

    fireEvent.keyDown(document.body, { key: " ", code: "Space" });
    fireEvent.keyUp(document.body, { key: " ", code: "Space" });

    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it("says when there is no media and while the media opens", () => {
    const { rerender } = renderPlayer(makeSession({ status: "none" }));
    expect(screen.getByText("No media to preview")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();

    rerender(makeSession({ status: "opening" }));
    expect(screen.getByText("Opening the media…")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("says why audio is being prepared after a media failure", () => {
    const { rerender } = renderPlayer(makeSession({ status: "video", url: VIDEO_URL }));
    stubMedia(video());

    rerender(makeSession({ status: "preparing", reason: "failed" }));

    expect(screen.getByRole("status")).toHaveTextContent("cannot be played here");
    expect(video().getAttribute("src")).toBe(VIDEO_URL);
  });
});

describe("the time rule in the player", () => {
  function renderStep(session: PreviewSession) {
    return render(
      <I18nextProvider i18n={i18n}>
        <SyncOffsetView
          session={session}
          defaults={null}
          detection={{ offsetMs: 750, confidence: 82, warnings: [] }}
          offsetMs={750}
          offsetExceedsMax={false}
          offsetIsZero={false}
          onOffsetChange={() => {}}
        />
      </I18nextProvider>,
    );
  }

  /** The offset controls' markup, without the ids `useId` numbers per render. */
  function offsetControls(container: HTMLElement): string {
    const field = container.querySelector(".offset-field");
    if (field === null) throw new Error("the step rendered no offset field");
    return field.outerHTML.replace(/ (id|aria-describedby)="[^"]*"/g, "");
  }

  function baselineControls(): string {
    const { container, unmount } = renderStep(makeSession({ status: "video", url: VIDEO_URL }));
    const markup = offsetControls(container);
    unmount();
    return markup;
  }

  it.each([
    ["video", { status: "video", url: VIDEO_URL }],
    ["audio", { status: "audio", url: AUDIO_URL }],
  ] as const)("draws the rule between the stage and the transport with %s and cues", (_, media) => {
    const { container } = renderStep(makeSession(media));

    const rule = container.querySelector(".time-rule");
    expect(rule).not.toBeNull();
    expect(rule?.previousElementSibling).toHaveClass("sync-player__stage");
    expect(rule?.nextElementSibling).toHaveClass("sync-player__transport");
  });

  // @covers sync-workflow/time-rule-scrolls-real-cues#rule-is-absent-without-playable-media-or-cues
  it.each([
    ["without media", makeSession({ status: "none" })],
    ["while opening", makeSession({ status: "opening" })],
    ["while preparing audio", makeSession({ status: "preparing", reason: "failed" })],
    ["when unavailable", makeSession({ status: "unavailable", error: PREVIEW_ERROR, canReturn: false })],
    ["when the cues failed to load", { ...makeSession({ status: "video", url: VIDEO_URL }, []), cueError: PREVIEW_ERROR }],
    ["without cues", makeSession({ status: "video", url: VIDEO_URL }, [])],
  ])("draws no rule %s and leaves the offset controls unchanged", (_, session) => {
    const baseline = baselineControls();
    const { container } = renderStep(session);

    expect(container.querySelector(".time-rule")).toBeNull();
    expect(offsetControls(container)).toBe(baseline);
    expect(screen.getByRole("spinbutton", { name: "Offset in milliseconds" })).toHaveValue(750);
  });
});
