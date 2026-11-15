import { useTranslation } from "react-i18next";

import { baseName, fileKind } from "../../platform/fileKind";
import { FileKindIcon } from "../icons/FileKindIcons";
import { groupByParent } from "./groupByParent";
import "./GroupedFileList.css";

export interface GroupedFileListProps {
  paths: readonly string[];
  /** Accessible name of the whole list. */
  label: string;
  /** Asked to remove one entry (`[path]`) or a whole group (all its paths). */
  onRemove: (paths: string[]) => void;
}

/**
 * The added sources, grouped by parent folder in two columns. This element is
 * the only scroller of a sources step, so it grows into the space left over.
 *
 * Groups are labelled `div`s rather than `section`s: a labelled section is a
 * landmark, and there may be hundreds of groups.
 */
export function GroupedFileList({ paths, label, onRemove }: GroupedFileListProps) {
  const { t } = useTranslation("common");

  return (
    <div className="file-groups" role="group" aria-label={label}>
      {groupByParent(paths).map((group) => (
        <div key={group.folder} className="file-groups__group" role="group" aria-label={group.folder}>
          <header className="file-groups__header">
            <span className="file-groups__folder" title={group.folder}>
              {group.folder}
            </span>
            <span className="file-groups__count">{group.paths.length}</span>
            <button
              type="button"
              className="button button--tertiary file-groups__remove-group"
              aria-label={t("fileList.removeGroup", { count: group.paths.length, folder: group.folder })}
              onClick={() => onRemove(group.paths)}
            >
              {t("fileList.removeGroupShort")}
            </button>
          </header>
          <ul className="file-groups__entries">
            {group.paths.map((path) => (
              <li key={path} className="file-groups__entry" data-kind={fileKind(path)}>
                <FileKindIcon kind={fileKind(path)} />
                <span className="file-groups__name" title={path}>
                  {baseName(path)}
                </span>
                <button
                  type="button"
                  className="file-groups__remove"
                  aria-label={t("fileList.remove", { name: baseName(path) })}
                  onClick={() => onRemove([path])}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
