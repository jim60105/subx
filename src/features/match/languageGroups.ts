import type { MatchPlanDto } from "../../types/ipc";

export interface LanguageGroup {
  code: string | null;
  operationIds: number[];
}

/** Groups each matched operation by its detected language, keeping first-seen order. */
export function groupOperationsByLanguage(plan: MatchPlanDto): LanguageGroup[] {
  const groups = new Map<string, LanguageGroup>();
  const undetected: number[] = [];

  for (const video of plan.videos) {
    for (const operation of video.matches) {
      if (operation.language === null) {
        undetected.push(operation.id);
        continue;
      }

      let group = groups.get(operation.language);
      if (group === undefined) {
        group = { code: operation.language, operationIds: [] };
        groups.set(operation.language, group);
      }
      group.operationIds.push(operation.id);
    }
  }

  const result = [...groups.values()];
  if (undetected.length > 0) result.push({ code: null, operationIds: undetected });
  return result;
}

/**
 * The platform's name for a plain two- or three-letter code, else the code itself.
 *
 * The pattern keeps `Intl.DisplayNames#of` from throwing on malformed codes.
 * Callers must prefer hand-written labels: `tc` and `sc` are not BCP 47
 * Chinese (`sc` is Sardinian to `Intl`).
 */
export function platformLanguageName(code: string, locale: string): string {
  if (!/^[a-z]{2,3}$/.test(code)) return code;
  return new Intl.DisplayNames([locale], { type: "language", fallback: "none" }).of(code) ?? code;
}
