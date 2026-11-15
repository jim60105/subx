import type { DiffLineSpec } from "../../components/DiffPreview/DiffPreview";
import type { RelocationModeDto } from "../../types/ipc";

/**
 * What each relocation mode does to one sample subtitle, shown as a diff in
 * place of a hint sentence. Sample file names: constants, never translated.
 */
export const RELOCATION_SAMPLES: Record<RelocationModeDto, readonly DiffLineSpec[]> = {
  rename: [
    { kind: "removed", text: "subs/03.ass" },
    { kind: "created", text: "subs/S01E03.ass" },
  ],
  copy: [
    { kind: "kept", text: "subs/03.ass" },
    { kind: "created", text: "video/S01E03.ass" },
  ],
  move: [
    { kind: "removed", text: "subs/03.ass" },
    { kind: "created", text: "video/S01E03.ass" },
  ],
};
