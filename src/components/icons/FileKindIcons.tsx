/** Line glyphs for source kinds. Coloured by `currentColor`; always decorative. */

import type { ReactNode } from "react";

import type { FileKind } from "../../platform/fileKind";

const PATHS: Record<FileKind, ReactNode> = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="m10 9 5 3-5 3z" />
    </>
  ),
  subtitle: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M7 14h6M15 14h2M7 11h3M12 11h5" />
    </>
  ),
  archive: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M11 3v2M11 7v2M11 11v2M11 15v2" />
    </>
  ),
  other: <path d="M6 3h9l4 4v14H6z" />,
};

export function FileKindIcon({ kind, size = 16 }: { kind: FileKind; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}
