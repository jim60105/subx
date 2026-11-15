import { useTranslation } from "react-i18next";
import "./DiffPreview.css";

export type DiffLineKind = "removed" | "created" | "kept";

export interface DiffLineSpec {
  kind: DiffLineKind;
  text: string;
}

/** `−` is U+2212, the typographic minus; a kept line carries no mark. */
const MARK: Record<DiffLineKind, string> = { removed: "−", created: "+", kept: "" };

/**
 * One file consequence. The mark is visual only; the kind reaches assistive
 * technology as visually hidden text so colour and strike-through are never
 * the only carriers.
 */
export function DiffLine({ kind, text }: DiffLineSpec) {
  const { t } = useTranslation("common");
  return (
    <span className="diff-line" data-kind={kind}>
      <span className="diff-line__mark" aria-hidden="true">
        {MARK[kind]}
      </span>
      <span className="diff-line__text">{text}</span>
      <span className="visually-hidden">{t(`diff.${kind}`)}</span>
    </span>
  );
}

export interface DiffPreviewProps {
  lines: readonly DiffLineSpec[];
  /** Accessible name of the list; omitted when decorative. */
  label?: string;
  /** Hides the whole preview from assistive technology. */
  decorative?: boolean;
}

/** File consequences as marked lines: what an operation does, shown rather than described. */
export function DiffPreview({ lines, label, decorative = false }: DiffPreviewProps) {
  return (
    <ul className="diff-preview" aria-label={label} aria-hidden={decorative || undefined}>
      {lines.map((line, index) => (
        <li key={index} className="diff-preview__line">
          <DiffLine kind={line.kind} text={line.text} />
        </li>
      ))}
    </ul>
  );
}
