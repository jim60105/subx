import { parentFolder } from "../../platform/fileKind";

export interface FileGroup {
  folder: string;
  paths: string[];
}

/** Groups by `parentFolder(path)`, groups in first-seen order, paths in given order. */
export function groupByParent(paths: readonly string[]): FileGroup[] {
  const groups = new Map<string, FileGroup>();
  for (const path of paths) {
    const folder = parentFolder(path);
    const group = groups.get(folder);
    if (group === undefined) groups.set(folder, { folder, paths: [path] });
    else group.paths.push(path);
  }
  return [...groups.values()];
}
