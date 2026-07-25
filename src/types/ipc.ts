/**
 * The IPC surface, as the rest of the frontend sees it.
 *
 * The types are re-exported from `bindings.ts`, which is generated from the
 * Rust definitions — nothing here transcribes a payload by hand any more. What
 * stays is the one thing a type generator cannot produce: a runtime guard.
 *
 * Importing through this module rather than from `bindings.ts` directly keeps
 * the guard next to the types it narrows, and keeps the existing import sites
 * unchanged.
 */

import type { ErrorDto } from "./bindings";

export type {
  AiConfigDto,
  ConfigDto,
  ConnectionTestResult,
  ConversionOutcomeDto,
  ConversionReportDto,
  ConversionStatusDto,
  ConvertFormatDto,
  ConvertItemDto,
  ConvertOptionsDto,
  ConvertPlanDto,
  ConvertProgress,
  ConvertScanResult,
  ConvertStage,
  ErrorDto,
  ExecutionOutcomeDto,
  ExecutionReportDto,
  MatchOperationDto,
  MatchPlanDto,
  MatchProgress,
  MatchStage,
  MatchedVideoDto,
  PingResponse,
  RelocationModeDto,
  SetConfigRequest,
  SourceScanResult,
} from "./bindings";

/**
 * Narrows an unknown rejection to an `ErrorDto`.
 *
 * Commands reject rather than resolving with a tagged result, and TypeScript
 * types no rejection — `catch` always yields `unknown`. This is the boundary
 * where that becomes a known shape again. It is defined against the *generated*
 * `ErrorDto`, so a change to the Rust error breaks it at compile time.
 *
 * All three fields are checked, `hintCode` included. The generated type declares
 * it as `string | null` — present and possibly null, never absent — so accepting
 * a value without the key would narrow to a type the value does not have, and
 * `dto.hintCode` would read `undefined` while claiming otherwise. Today both
 * callers test it for truthiness and cannot tell the difference; the first one
 * to write `=== null` would get a silently wrong answer.
 */
export function isErrorDto(value: unknown): value is ErrorDto {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as ErrorDto;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    "hintCode" in candidate &&
    (candidate.hintCode === null || typeof candidate.hintCode === "string")
  );
}
