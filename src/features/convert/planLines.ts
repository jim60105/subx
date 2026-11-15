import type { DiffLineSpec } from "../../components/DiffPreview/DiffPreview";
import type { ConvertItemDto } from "../../types/ipc";

/**
 * One planned conversion as file consequences.
 *
 * Excluded: the input, kept. Otherwise: the input, kept while keep-original is
 * on and removed while it is off, then the backend-resolved output path,
 * created. The output is the full path because the plan promises an exact
 * output-path preview.
 */
export function convertItemLines(item: ConvertItemDto, keepOriginal: boolean): DiffLineSpec[] {
  const input: DiffLineSpec = { kind: "kept", text: item.inputName };
  if (item.skipReason !== null) return [input];
  return [
    keepOriginal ? input : { kind: "removed", text: item.inputName },
    { kind: "created", text: item.outputPath },
  ];
}
