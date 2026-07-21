import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { isErrorDto } from "../types/ipc";
import type { ErrorDto } from "../types/ipc";

export interface LocalizedError {
  /** Primary user-facing text. */
  message: string;
  /** Recovery advice, when the error carried a known `hintCode`. */
  hint?: string;
  /** Raw English message from the backend, for the "technical details" section. */
  detail: string;
  /** False when the code had no translation and the generic fallback was used. */
  isKnown: boolean;
}

const UNKNOWN_ERROR_DETAIL = "Unrecognized error value";

/**
 * Resolves a backend `ErrorDto` into localized text.
 *
 * The backend never translates: it returns stable codes. Codes missing from the
 * locale files degrade to a generic localized message with the raw English
 * message preserved as detail, so an untranslated failure is still actionable.
 */
export function useLocalizedError(): (error: unknown) => LocalizedError {
  const { t, i18n } = useTranslation("errors");

  return useCallback(
    (error: unknown): LocalizedError => {
      const dto: ErrorDto = isErrorDto(error)
        ? error
        : { code: "core.internal", message: String(error ?? UNKNOWN_ERROR_DETAIL) };

      const messageKey = `codes.${dto.code}`;
      const isKnown = i18n.exists(messageKey, { ns: "errors" });

      const hintKey = dto.hintCode ? `hints.${dto.hintCode}` : undefined;
      const hasHint = hintKey !== undefined && i18n.exists(hintKey, { ns: "errors" });

      return {
        message: isKnown ? t(messageKey) : t("generic"),
        hint: hasHint ? t(hintKey) : undefined,
        detail: dto.message,
        isKnown,
      };
    },
    [t, i18n],
  );
}
