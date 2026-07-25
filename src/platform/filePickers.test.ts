import { afterEach, describe, expect, it, vi } from "vitest";

// The native pickers and the drag-drop subscription live in modules mockIPC
// does not cover, so they are mocked directly.
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: vi.fn() }));

import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

import { pickFiles, pickFolder, subscribeToDroppedPaths } from "./filePickers";

afterEach(() => {
  vi.clearAllMocks();
});

describe("the native pickers", () => {
  it("returns every chosen file", async () => {
    vi.mocked(open).mockResolvedValue(["/a.mkv", "/b.srt"]);
    await expect(pickFiles()).resolves.toEqual(["/a.mkv", "/b.srt"]);
  });

  it("wraps a single chosen file in an array", async () => {
    vi.mocked(open).mockResolvedValue("/only.srt");
    await expect(pickFiles()).resolves.toEqual(["/only.srt"]);
  });

  it("returns nothing when the file picker is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await expect(pickFiles()).resolves.toEqual([]);
  });

  it("returns the chosen folder", async () => {
    vi.mocked(open).mockResolvedValue("/folder");
    await expect(pickFolder()).resolves.toEqual(["/folder"]);
  });

  it("returns nothing when the folder picker is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await expect(pickFolder()).resolves.toEqual([]);
  });
});

describe("the drag-drop subscription", () => {
  it("forwards dropped paths and ignores other drag events", async () => {
    let handler: ((event: { payload: { type: string; paths?: string[] } }) => void) | undefined;
    const unlisten = vi.fn();
    vi.mocked(getCurrentWebview).mockReturnValue({
      onDragDropEvent: (callback: (event: unknown) => void) => {
        handler = callback as typeof handler;
        return Promise.resolve(unlisten);
      },
    } as unknown as ReturnType<typeof getCurrentWebview>);

    const onPaths = vi.fn();
    const off = await subscribeToDroppedPaths(onPaths);

    handler?.({ payload: { type: "over" } });
    expect(onPaths).not.toHaveBeenCalled();

    handler?.({ payload: { type: "drop", paths: ["/dropped.mkv"] } });
    expect(onPaths).toHaveBeenCalledWith(["/dropped.mkv"]);

    expect(off).toBe(unlisten);
  });
});
