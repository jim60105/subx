import { baseName } from "../../platform/fileKind";
import type { ExecutionOutcomeDto, ExecutionReportDto, MatchOperationDto, MatchPlanDto } from "../../types/ipc";

export interface ExecuteRow {
  key: string;
  oldName: string;
  newName: string;
  /** `null` until the report arrives. */
  outcome: ExecutionOutcomeDto | null;
}

/**
 * Rows for the selected operations in plan order (`plan.videos` then `matches`).
 *
 * With a report: outcomes carry no operation id, but the backend filters the
 * plan by index, so they arrive in ascending operation-id order and the outcome
 * of id `x` is `report.outcomes[sortedSelectedIds.indexOf(x)]`. The mapping is
 * trusted only when `report.outcomes.length` equals the number of selected
 * operations AND every mapped outcome's `subtitleName` equals its operation's
 * `subtitleName`. Otherwise the rows are built from `report.outcomes` alone,
 * in report order, so no outcome is hidden or attributed to the wrong file.
 */
export function buildExecuteRows(
  plan: MatchPlanDto,
  selectedIds: ReadonlySet<number>,
  report: ExecutionReportDto | null,
): ExecuteRow[] {
  const selected: MatchOperationDto[] = plan.videos
    .flatMap((video) => video.matches)
    .filter((operation) => selectedIds.has(operation.id));

  if (report === null) {
    return selected.map((operation) => ({ ...rowOf(operation), outcome: null }));
  }

  const ascending = selected.map((operation) => operation.id).sort((a, b) => a - b);
  const outcomeOf = (operation: MatchOperationDto) => report.outcomes[ascending.indexOf(operation.id)];
  const trusted =
    report.outcomes.length === selected.length &&
    selected.every((operation) => outcomeOf(operation).subtitleName === operation.subtitleName);

  if (trusted) {
    return selected.map((operation) => ({ ...rowOf(operation), outcome: outcomeOf(operation) }));
  }
  return report.outcomes.map((outcome, index) => ({
    key: `outcome-${index}`,
    oldName: outcome.subtitleName,
    newName: baseName(outcome.targetPath),
    outcome,
  }));
}

function rowOf(operation: MatchOperationDto): Omit<ExecuteRow, "outcome"> {
  return {
    key: `op-${operation.id}`,
    oldName: operation.subtitleName,
    newName: baseName(operation.targetPath),
  };
}
