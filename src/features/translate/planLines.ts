import type { DiffLineSpec } from "../../components/DiffPreview/DiffPreview";
import type { TranslateItemDto, TranslateOutputModeDto } from "../../types/ipc";

/**
 * One planned translation as file consequences.
 *
 * Excluded: the input, kept. Suffix mode keeps the input and creates the
 * output beside it; replace mode removes the input and creates the same path
 * again with the translated content. The created line is the full path the
 * backend resolved.
 */
export function translateItemLines(
  item: TranslateItemDto,
  outputMode: TranslateOutputModeDto,
): DiffLineSpec[] {
  if (item.skipReason !== null) return [{ kind: "kept", text: item.inputName }];
  return [
    { kind: outputMode === "replace" ? "removed" : "kept", text: item.inputName },
    { kind: "created", text: item.outputPath },
  ];
}
