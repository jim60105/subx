import { useCallback, useEffect, useRef, useState } from "react";
import { isErrorDto } from "../../types/ipc";
import type { ConfigDto, ConnectionTestResult } from "../../types/ipc";
import { AI_FIELDS, getConfig, setConfigValue, testAiConnection } from "./settingsApi";
import type { AiField } from "./settingsApi";

/** The AI form's working copy. `apiKey` is replace-only: empty means "leave as is". */
export type AiDraft = Record<AiField, string>;

export type FieldErrors = Partial<Record<AiField, unknown>>;

export type TestStatus = "idle" | "running" | "done";

export interface SettingsForm {
  /** Last values read from disk; `null` until the first load finishes. */
  config: ConfigDto | null;
  draft: AiDraft;
  /** Rejection of the initial load, if it failed. */
  loadError: unknown;
  /** Per-field rejections from the last save. */
  fieldErrors: FieldErrors;
  /** A save failure that belongs to no single field (e.g. the write itself). */
  saveError: unknown;
  isDirty: boolean;
  isSaving: boolean;
  testStatus: TestStatus;
  testResult: ConnectionTestResult | null;
  setField: (field: AiField, value: string) => void;
  save: () => Promise<void>;
  runConnectionTest: () => Promise<void>;
}

const EMPTY_DRAFT: AiDraft = { provider: "", model: "", baseUrl: "", apiKey: "" };

/** The saved counterpart of a draft field; a stored key is never readable, so it reads as empty. */
function savedValue(config: ConfigDto, field: AiField): string {
  return field === "apiKey" ? "" : config.ai[field];
}

function draftFrom(config: ConfigDto): AiDraft {
  return Object.fromEntries(
    AI_FIELDS.map((field) => [field, savedValue(config, field)]),
  ) as AiDraft;
}

/**
 * Rebuilds the draft from freshly read config, preserving the fields `keep`
 * selects. Used by both re-fetch paths, which differ only in what they keep.
 */
function mergeDraft(
  current: AiDraft,
  config: ConfigDto,
  keep: (field: AiField) => boolean,
): AiDraft {
  const fresh = draftFrom(config);
  return Object.fromEntries(
    AI_FIELDS.map((field) => [field, keep(field) ? current[field] : fresh[field]]),
  ) as AiDraft;
}

/**
 * Owns the settings screen's data: loading, per-key saving, and the connection
 * test. Kept out of the components so the screen stays a layout, and so this
 * orchestration is testable on its own.
 */
export function useSettingsForm(): SettingsForm {
  const [config, setConfig] = useState<ConfigDto | null>(null);
  const [draft, setDraft] = useState<AiDraft>(EMPTY_DRAFT);
  const [loadError, setLoadError] = useState<unknown>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<unknown>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const isFieldDirty = useCallback(
    (field: AiField) => (config ? draft[field] !== savedValue(config, field) : false),
    [config, draft],
  );

  const isDirty = AI_FIELDS.some(isFieldDirty);

  // Read by the focus listener, which is registered once and must still see the
  // current dirty state on every fire.
  const isFieldDirtyRef = useRef(isFieldDirty);
  useEffect(() => {
    isFieldDirtyRef.current = isFieldDirty;
  });

  // Serializes every config fetch — the initial load, focus refetches, and
  // persist()'s own post-save refetch all bump this and apply their result only
  // if still the latest. Without it a slow focus refetch that started before a
  // save could resolve afterwards and revert the screen to pre-save values.
  const loadSeqRef = useRef(0);

  // Held for the full duration of a save or a connection test (both set
  // synchronously at entry). Gives save/runConnectionTest a reentrancy lock the
  // disabled attribute can't guarantee, and lets the focus listener skip a
  // refetch that would race the action in flight.
  const actionLockRef = useRef(false);

  // Initial load, and a re-fetch whenever the window regains focus so an edit
  // made in the CLI shows up on return. Fields the user has already touched are
  // kept: picking up external changes must not throw away work in progress.
  useEffect(() => {
    let cancelled = false;

    const load = (isInitial: boolean) => {
      const seq = ++loadSeqRef.current;
      getConfig().then(
        (next) => {
          if (cancelled || seq !== loadSeqRef.current) return;
          setConfig(next);
          setDraft((current) =>
            isInitial ? draftFrom(next) : mergeDraft(current, next, isFieldDirtyRef.current),
          );
          setLoadError(undefined);
        },
        (error) => {
          if (cancelled || seq !== loadSeqRef.current) return;
          if (isInitial) setLoadError(error);
        },
      );
    };

    load(true);

    const onFocus = () => {
      if (!actionLockRef.current) load(false);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const setField = useCallback((field: AiField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setTestStatus("idle");
  }, []);

  /** Writes every changed field, keeps going past a rejection, and returns what failed. */
  const persist = useCallback(async (): Promise<FieldErrors> => {
    if (config === null) return {};

    const errors: FieldErrors = {};
    for (const field of AI_FIELDS) {
      if (draft[field] === savedValue(config, field)) continue;
      try {
        await setConfigValue(field, draft[field]);
      } catch (error) {
        // Per-key writes are independent: a rejected value must not block the
        // fields the user got right.
        errors[field] = error;
      }
    }

    setFieldErrors(errors);

    const seq = ++loadSeqRef.current;
    try {
      const refreshed = await getConfig();
      if (seq === loadSeqRef.current) {
        setConfig(refreshed);
        // Rejected values stay in the form so the user can correct them; the
        // accepted ones are replaced by what actually landed on disk.
        setDraft((current) =>
          mergeDraft(current, refreshed, (field) => errors[field] !== undefined),
        );
        setSaveError(undefined);
      }
    } catch (error) {
      setSaveError(error);
    }

    return errors;
  }, [config, draft]);

  const save = useCallback(async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setIsSaving(true);
    setTestStatus("idle");
    try {
      await persist();
    } finally {
      setIsSaving(false);
      actionLockRef.current = false;
    }
  }, [persist]);

  // The backend tests whatever is on disk, so pending edits are saved first —
  // otherwise the result would describe a configuration the user cannot see.
  const runConnectionTest = useCallback(async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    try {
      let errors: FieldErrors;
      setIsSaving(true);
      try {
        errors = await persist();
      } finally {
        setIsSaving(false);
      }
      if (Object.values(errors).some((error) => error !== undefined)) return;

      setTestStatus("running");
      try {
        setTestResult(await testAiConnection());
      } catch (error) {
        // The command resolves even on a rejected connection, so this only
        // fires on a transport-level failure whose shape we can't assume.
        setTestResult({
          ok: false,
          latencyMs: null,
          error: isErrorDto(error)
            ? error
            : { code: "core.internal", message: String(error), hintCode: null },
        });
      }
      setTestStatus("done");
    } finally {
      actionLockRef.current = false;
    }
  }, [persist]);

  return {
    config,
    draft,
    loadError,
    fieldErrors,
    saveError,
    isDirty,
    isSaving,
    testStatus,
    testResult,
    setField,
    save,
    runConnectionTest,
  };
}
