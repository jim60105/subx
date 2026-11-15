import { baseName, fileKind, parentFolder } from "../../platform/fileKind";
import type { TranslateScanResult } from "../../types/ipc";

/** One found subtitle, or a directly added file whose count is not known yet. */
export interface LedgerRow {
  key: string;
  name: string;
  /** `null` while the scan has not returned. */
  cueCount: number | null;
  unparsable: boolean;
  /** The source path removing this row removes; only a directly added file has one. */
  removePath: string | null;
}

/** One source location: a parent folder of direct files, a folder source, or an archive source. */
export interface LedgerGroup {
  key: string;
  kind: "folder" | "archive";
  location: string;
  /** Every source path the group's remove action removes; empty means no remove action. */
  removePaths: string[];
  rows: LedgerRow[];
  /** Whether the group gathers directly added files by their parent folder. */
  direct: boolean;
  cueSubtotal: number;
}

export interface Ledger {
  groups: LedgerGroup[];
  /** Whether the totals below reflect a completed scan. */
  counted: boolean;
  fileCount: number;
  cueTotal: number;
}

type SourceShape = "direct" | "folder" | "archive";

/**
 * How a source path is treated, judged from its name alone (design D2). A
 * dropped path of another kind is grouped as a folder.
 */
function shapeOf(source: string): SourceShape {
  const kind = fileKind(source);
  if (kind === "archive") return "archive";
  if (kind === "subtitle") return "direct";
  return "folder";
}

function cuesOf(rows: readonly LedgerRow[]): number {
  return rows.reduce((sum, row) => sum + (row.unparsable || row.cueCount === null ? 0 : row.cueCount), 0);
}

/**
 * Groups the scan result by the source location that produced each file.
 *
 * The backend already lists each resolved subtitle once and names its source,
 * so this only buckets. Groups keep first-added order. While the scan runs, or
 * after it failed, rows come from `sources` alone: a directly added file is
 * listed with an unknown count, and folder and archive groups have no rows.
 */
export function buildLedger(
  sources: readonly string[],
  scan: TranslateScanResult | null,
  isScanning: boolean,
): Ledger {
  const counted = scan !== null && !isScanning;
  const groups = new Map<string, LedgerGroup>();
  // Which group each source path feeds, so scan items can find theirs.
  const groupOfSource = new Map<string, LedgerGroup>();

  for (const source of sources) {
    const shape = shapeOf(source);
    if (shape === "direct") {
      const folder = parentFolder(source);
      const key = `parent:${folder}`;
      let group = groups.get(key);
      if (group === undefined) {
        group = { key, kind: "folder", location: folder, removePaths: [], rows: [], direct: true, cueSubtotal: 0 };
        groups.set(key, group);
      }
      group.removePaths.push(source);
      groupOfSource.set(source, group);
      if (!counted) {
        group.rows.push({ key: source, name: baseName(source), cueCount: null, unparsable: false, removePath: source });
      }
    } else {
      const key = `source:${source}`;
      const group: LedgerGroup = {
        key,
        kind: shape,
        location: source,
        removePaths: [source],
        rows: [],
        direct: false,
        cueSubtotal: 0,
      };
      groups.set(key, group);
      groupOfSource.set(source, group);
    }
  }

  if (counted) {
    scan.files.forEach((file, index) => {
      let group = groupOfSource.get(file.source);
      // A file attributed to no listed source (the backend's parent-folder
      // fallback) still gets a group, but there is nothing it could remove.
      if (group === undefined) {
        const key = `fallback:${file.source}`;
        group = groups.get(key);
        if (group === undefined) {
          group = { key, kind: "folder", location: file.source, removePaths: [], rows: [], direct: false, cueSubtotal: 0 };
          groups.set(key, group);
        }
      }
      const isDirect = shapeOf(file.source) === "direct" && groupOfSource.has(file.source);
      group.rows.push({
        key: `${file.source}\u0000${file.name}\u0000${index}`,
        name: file.name,
        cueCount: file.unparsable ? null : file.cueCount,
        unparsable: file.unparsable,
        removePath: isDirect ? file.source : null,
      });
    });
  }

  const list = [...groups.values()];
  for (const group of list) group.cueSubtotal = cuesOf(group.rows);

  return {
    groups: list,
    counted,
    fileCount: counted ? scan.files.length : 0,
    cueTotal: counted ? list.reduce((sum, group) => sum + group.cueSubtotal, 0) : 0,
  };
}
