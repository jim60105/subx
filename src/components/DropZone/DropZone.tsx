import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { FileKind } from "../../platform/fileKind";
import { FileKindIcon } from "../icons/FileKindIcons";
import "./DropZone.css";

export type IntakeKind = Exclude<FileKind, "other">;

/** Captions under the glyphs in the large form. Extensions are data, not prose. */
export const KIND_CAPTIONS: Record<Exclude<IntakeKind, "folder">, string> = {
  video: ".mkv .mp4",
  subtitle: ".srt .ass",
  archive: ".zip .7z",
};

export interface DropZoneProps {
  /** Accepted input kinds, in display order. */
  kinds: readonly IntakeKind[];
  /** True once at least one source is listed. */
  compact: boolean;
  /** The sentence the glyphs replace; rendered visually hidden. */
  description: string;
  onBrowseFiles: () => void;
  onBrowseFolder: () => void;
}

/**
 * Shows which inputs a wizard accepts as glyphs, with the browse actions.
 *
 * Large while nothing is listed, a single strip afterwards. It handles no drop
 * events itself: the whole window is the drop target, subscribed by the wizard.
 */
export function DropZone({ kinds, compact, description, onBrowseFiles, onBrowseFolder }: DropZoneProps) {
  const { t } = useTranslation("common");
  const descriptionId = useId();

  return (
    <div
      className="drop-zone"
      data-state={compact ? "compact" : "large"}
      role="group"
      aria-label={t("dropZone.label")}
      aria-describedby={descriptionId}
    >
      <p id={descriptionId} className="visually-hidden">
        {description}
      </p>
      <ul className="drop-zone__kinds" aria-hidden="true">
        {kinds.map((kind) => (
          <li key={kind} className="drop-zone__kind" data-kind={kind}>
            <FileKindIcon kind={kind} size={compact ? 16 : 22} />
            {!compact && (
              <span className="drop-zone__caption">
                {kind === "folder" ? t("fileKinds.folder") : KIND_CAPTIONS[kind]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {compact && <span className="drop-zone__hint">{t("dropZone.label")}</span>}
      <div className="drop-zone__actions">
        <button type="button" className="button drop-zone__browse" onClick={onBrowseFiles}>
          {t("dropZone.browseFiles")}
        </button>
        <button type="button" className="button drop-zone__browse" onClick={onBrowseFolder}>
          {t("dropZone.browseFolder")}
        </button>
      </div>
    </div>
  );
}
