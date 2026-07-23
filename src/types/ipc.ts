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

/** AI section of the shared CLI configuration, as the GUI is allowed to see it. */
export interface AiConfigDto {
  /** Canonical provider id. */
  provider: string;
  model: string;
  baseUrl: string;
  /** Masked key (e.g. `****abcd`); empty when none is configured. */
  apiKeyMasked: string;
  /** Whether a key is configured at all. The cleartext value never crosses IPC. */
  apiKeySet: boolean;
}

export interface ConfigDto {
  ai: AiConfigDto;
}

/** One `key = value` write against the shared configuration. */
export interface SetConfigRequest {
  /** Dotted config key, e.g. `ai.provider`. */
  key: string;
  value: string;
}

/** Outcome of an explicit AI connection test; a rejection resolves, not throws. */
export interface ConnectionTestResult {
  ok: boolean;
  /** Round-trip time of the probe request; present only on success. */
  latencyMs?: number;
  /** Why the test failed; present only on failure. */
  error?: ErrorDto;
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
