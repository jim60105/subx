import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AiConfigDto } from "../../types/ipc";
import { SettingsField } from "./SettingsField";

const FIELD_ID = "ai-api-key";

interface ApiKeyFieldProps {
  /** Last values read from disk: only the masked form and whether a key exists. */
  saved: AiConfigDto;
  /** The replace-only draft; empty means "leave the stored key as it is". */
  value: string;
  error: unknown;
  disabled: boolean;
  onChange: (value: string) => void;
}

/**
 * The API key, shown masked with a Replace action instead of an always-present
 * empty input.
 *
 * The key is write-only: only its masked form ever reaches the frontend. The
 * input appears when there is no key, after Replace, or whenever a draft is
 * pending — a typed draft is never hidden, because hidden it would still be
 * saved. Replace closes again once a key write lands, detected by the masked
 * form or the configured flag changing; a new key whose mask is identical
 * leaves the emptied input open, which is safe because an empty draft writes
 * nothing. The reset is deliberately not tied to the
 * saved object's identity: every window-focus refetch replaces that object,
 * and the user may well have switched windows to copy the new key.
 */
export function ApiKeyField({ saved, value, error, disabled, onChange }: ApiKeyFieldProps) {
  const { t } = useTranslation("settings");
  const [replacing, setReplacing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  // Where focus goes after the next render: the input after Replace, the
  // Replace button after Keep, so the activated control's removal never drops
  // keyboard focus onto the page.
  const focusNext = useRef<"input" | "replace" | null>(null);

  useEffect(() => {
    setReplacing(false);
  }, [saved.apiKeyMasked, saved.apiKeySet]);

  const showInput = !saved.apiKeySet || replacing || value !== "";

  useEffect(() => {
    if (focusNext.current === "input") inputRef.current?.focus();
    if (focusNext.current === "replace") replaceRef.current?.focus();
    focusNext.current = null;
  });

  return (
    <SettingsField
      id={FIELD_ID}
      label={t("ai.apiKey.label")}
      hint={t("ai.apiKey.hint")}
      hintHidden
      labelsControl={showInput}
      error={error}
    >
      {(control) =>
        showInput ? (
          <div className="settings-key">
            <input
              {...control}
              ref={inputRef}
              className="settings-control"
              type="password"
              spellCheck={false}
              autoComplete="off"
              /* Never pre-filled: the stored key is write-only. */
              placeholder={saved.apiKeySet ? undefined : t("ai.apiKey.unsetPlaceholder")}
              value={value}
              disabled={disabled}
              onChange={(event) => onChange(event.target.value)}
            />
            {saved.apiKeySet && (
              <button
                type="button"
                className="button button--tertiary settings-key__action"
                disabled={disabled}
                onClick={() => {
                  onChange("");
                  setReplacing(false);
                  focusNext.current = "replace";
                }}
              >
                {t("ai.apiKey.keep")}
              </button>
            )}
          </div>
        ) : (
          <div className="settings-key">
            <span id={FIELD_ID} className="settings-key__mask">
              {saved.apiKeyMasked}
            </span>
            <button
              ref={replaceRef}
              id={`${FIELD_ID}-replace`}
              type="button"
              className="button button--tertiary settings-key__action"
              aria-labelledby={`${FIELD_ID}-replace ${FIELD_ID}-label`}
              aria-describedby={[FIELD_ID, control["aria-describedby"]].filter(Boolean).join(" ")}
              disabled={disabled}
              onClick={() => {
                setReplacing(true);
                focusNext.current = "input";
              }}
            >
              {t("ai.apiKey.replace")}
            </button>
          </div>
        )
      }
    </SettingsField>
  );
}
