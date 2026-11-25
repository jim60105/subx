import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closePreview,
  loadPreviewCues,
  openPreview,
  preparePreviewAudio,
  releasePreviewAudio,
} from "./previewApi";

afterEach(() => {
  clearMocks();
});

/** Answers exactly one command, recording its arguments. */
function answer(expected: string, value: unknown) {
  const seen = vi.fn();
  mockIPC((command, args) => {
    if (command !== expected) throw new Error(`unexpected command: ${command}`);
    seen(args);
    return value;
  });
  return seen;
}

describe("the preview command wrappers", () => {
  it("loads the cues of a subtitle", async () => {
    const cues = [{ startMs: 0, endMs: 1_000, text: "hello" }];
    const seen = answer("load_preview_cues", cues);

    await expect(loadPreviewCues("/m/e.srt")).resolves.toEqual(cues);
    expect(seen).toHaveBeenCalledWith({ subtitlePath: "/m/e.srt" });
  });

  it("opens a session for the media", async () => {
    const session = { sessionId: "s1", url: "http://127.0.0.1:1234/s1" };
    const seen = answer("open_preview", session);

    await expect(openPreview("/m/e.mkv")).resolves.toEqual(session);
    expect(seen).toHaveBeenCalledWith({ mediaPath: "/m/e.mkv" });
  });

  it("prepares the audio and resolves to its URL", async () => {
    const seen = answer("prepare_preview_audio", { url: "http://127.0.0.1:1234/s1/audio" });

    await expect(preparePreviewAudio("s1")).resolves.toBe("http://127.0.0.1:1234/s1/audio");
    expect(seen).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("releases the audio", async () => {
    const seen = answer("release_preview_audio", null);

    await expect(releasePreviewAudio("s1")).resolves.toBeUndefined();
    expect(seen).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("closes the session", async () => {
    const seen = answer("close_preview", null);

    await expect(closePreview("s1")).resolves.toBeUndefined();
    expect(seen).toHaveBeenCalledWith({ sessionId: "s1" });
  });
});
