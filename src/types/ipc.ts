/**
 * TypeScript mirrors of the backend DTOs in `src-tauri/src/dto.rs` and
 * `src-tauri/src/error.rs`. The Rust side serializes with `rename_all =
 * "camelCase"`, so field names match one-to-one.
 */

/** Rejection value of every Tauri command. */
export interface ErrorDto {
  /** Stable machine-readable code, used as a localization key. */
  code: string;
  /** Raw English detail; shown as supporting detail, never as the primary text. */
  message: string;
  /** Optional stable code for a recovery hint. */
  hintCode?: string;
}

export interface PingResponse {
  message: string;
  appVersion: string;
}

/** Narrows an unknown rejection to an `ErrorDto`. */
export function isErrorDto(value: unknown): value is ErrorDto {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ErrorDto).code === "string" &&
    typeof (value as ErrorDto).message === "string"
  );
}
