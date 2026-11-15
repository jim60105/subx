/**
 * What a source path looks like, judged from its name alone.
 *
 * The frontend cannot stat a path and no IPC exists for it, so the kind is a
 * cosmetic guess from the extension. The extension sets mirror the ones the
 * matching engine accepts.
 */

export type FileKind = "folder" | "video" | "subtitle" | "archive" | "other";

export const VIDEO_EXTENSIONS = ["mp4", "mkv", "avi", "mov", "wmv", "flv", "m4v", "webm"] as const;
export const SUBTITLE_EXTENSIONS = ["srt", "ass", "ssa", "vtt", "sub", "idx"] as const;
export const ARCHIVE_EXTENSIONS = ["zip", "rar", "7z", "tgz"] as const;

const SEPARATOR = /[\\/]/;
const TRAILING_SEPARATORS = /[\\/]+$/;

/** Last path segment; handles `/` and `\`, ignores a trailing separator. */
export function baseName(path: string): string {
  const segments = path.split(SEPARATOR).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/** Everything up to and including the last separator before the base name; "" when there is none. */
export function parentFolder(path: string): string {
  const trimmed = path.replace(TRAILING_SEPARATORS, "");
  const last = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return last === -1 ? "" : trimmed.slice(0, last + 1);
}

function isOneOf(extension: string, list: readonly string[]): boolean {
  return list.includes(extension);
}

/**
 * Kind from the base name's extension, case-insensitive. `.tar.gz` is an
 * archive. A base name with no extension (no dot, or only a leading dot) is a
 * folder. Anything else is "other".
 */
export function fileKind(path: string): FileKind {
  const name = baseName(path).toLowerCase();
  if (name.endsWith(".tar.gz")) return "archive";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "folder";
  const extension = name.slice(dot + 1);
  if (isOneOf(extension, VIDEO_EXTENSIONS)) return "video";
  if (isOneOf(extension, SUBTITLE_EXTENSIONS)) return "subtitle";
  if (isOneOf(extension, ARCHIVE_EXTENSIONS)) return "archive";
  return "other";
}
