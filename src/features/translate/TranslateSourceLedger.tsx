import { useTranslation } from "react-i18next";

import { FileKindIcon } from "../../components/icons/FileKindIcons";
import type { TranslateScanResult } from "../../types/ipc";
import { buildLedger } from "./ledger";
import type { LedgerGroup, LedgerRow } from "./ledger";
import "./TranslateSourceLedger.css";

interface TranslateSourceLedgerProps {
  sources: readonly string[];
  scan: TranslateScanResult | null;
  isScanning: boolean;
  /** Asked to remove one directly added file (`[path]`) or a whole group. */
  onRemoveSources: (paths: string[]) => void;
}

/**
 * The one list of the translate sources step: every subtitle the scan found,
 * once, grouped by the source location that produced it, with cue counts,
 * group subtotals and a summary (design D1, D2).
 *
 * Groups are labelled `div`s rather than `section`s for the same reason as
 * `GroupedFileList`: a labelled section is a landmark, and there may be many.
 */
export function TranslateSourceLedger({ sources, scan, isScanning, onRemoveSources }: TranslateSourceLedgerProps) {
  const { t, i18n } = useTranslation("translate");
  const ledger = buildLedger(sources, scan, isScanning);
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <div className="translate-ledger" role="group" aria-label={t("sources.listLabel")}>
      <p className="translate-ledger__summary" role="status">
        {isScanning
          ? t("sources.ledger.scanning")
          : ledger.counted
            ? t("sources.ledger.summary", {
                files: t("sources.ledger.files", { count: ledger.fileCount, files: number.format(ledger.fileCount) }),
                cues: t("sources.ledger.cues", { count: ledger.cueTotal, cues: number.format(ledger.cueTotal) }),
              })
            : null}
      </p>
      {ledger.groups.map((group) => (
        <LedgerGroupView
          key={group.key}
          group={group}
          counted={ledger.counted}
          isScanning={isScanning}
          format={(value) => number.format(value)}
          onRemoveSources={onRemoveSources}
        />
      ))}
    </div>
  );
}

interface LedgerGroupViewProps {
  group: LedgerGroup;
  counted: boolean;
  isScanning: boolean;
  format: (value: number) => string;
  onRemoveSources: (paths: string[]) => void;
}

function LedgerGroupView({ group, counted, isScanning, format, onRemoveSources }: LedgerGroupViewProps) {
  const { t } = useTranslation("translate");
  const { t: tCommon } = useTranslation("common");
  // A direct-file group knows its files before the scan returns; a folder or
  // archive group knows nothing until then.
  const knowsFiles = counted || group.direct;

  return (
    <div className="translate-ledger__group" role="group" aria-label={group.location} data-kind={group.kind}>
      <header className="translate-ledger__header">
        <FileKindIcon kind={group.kind} />
        <span className="translate-ledger__location" title={group.location}>
          <bdi>{group.location}</bdi>
        </span>
        <span className="translate-ledger__files">
          {knowsFiles
            ? t("sources.ledger.files", { count: group.rows.length, files: format(group.rows.length) })
            : isScanning
              ? t("sources.ledger.scanning")
              : null}
        </span>
        <span className="translate-ledger__count translate-ledger__subtotal">
          {counted ? t("sources.ledger.cues", { count: group.cueSubtotal, cues: format(group.cueSubtotal) }) : null}
        </span>
        <span className="translate-ledger__action">
          {group.removePaths.length > 0 && (
            <button
              type="button"
              className="button button--tertiary translate-ledger__remove-group"
              aria-label={tCommon("fileList.removeGroup", { count: group.removePaths.length, folder: group.location })}
              onClick={() => onRemoveSources(group.removePaths)}
            >
              {tCommon("fileList.removeGroupShort")}
            </button>
          )}
        </span>
      </header>
      {group.rows.length > 0 && (
        <ul className="translate-ledger__rows">
          {group.rows.map((row) => (
            <LedgerRowView key={row.key} row={row} format={format} onRemoveSources={onRemoveSources} />
          ))}
        </ul>
      )}
    </div>
  );
}

interface LedgerRowViewProps {
  row: LedgerRow;
  format: (value: number) => string;
  onRemoveSources: (paths: string[]) => void;
}

function LedgerRowView({ row, format, onRemoveSources }: LedgerRowViewProps) {
  const { t } = useTranslation("translate");
  const { t: tCommon } = useTranslation("common");

  let count;
  if (row.unparsable) {
    // Icon plus text, never colour alone.
    count = (
      <span className="translate-ledger__flag">
        <span aria-hidden="true">⚠ </span>
        {t("sources.ledger.unparsable")}
      </span>
    );
  } else if (row.cueCount === null) {
    count = (
      <>
        <span className="translate-ledger__placeholder" aria-hidden="true" />
        <span className="visually-hidden">{t("sources.ledger.counting")}</span>
      </>
    );
  } else {
    count = t("sources.ledger.cues", { count: row.cueCount, cues: format(row.cueCount) });
  }

  return (
    <li className="translate-ledger__row" data-unparsable={row.unparsable || undefined}>
      <FileKindIcon kind="subtitle" />
      <span className="translate-ledger__name" title={row.name}>
        {row.name}
      </span>
      <span className="translate-ledger__count">{count}</span>
      <span className="translate-ledger__action">
        {row.removePath !== null && (
          <button
            type="button"
            className="translate-ledger__remove"
            aria-label={tCommon("fileList.remove", { name: row.name })}
            onClick={() => onRemoveSources([row.removePath as string])}
          >
            ✕
          </button>
        )}
      </span>
    </li>
  );
}
