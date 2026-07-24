import { commands } from "../../types/bindings";
import type { ConfigDto, ConnectionTestResult } from "../../types/ipc";

/**
 * Editable AI fields, in the order they must be written.
 *
 * Writes are per-key and non-transactional, so dependent fields go first:
 * the provider determines which model and base URL are valid.
 */
export const AI_FIELDS = ["provider", "model", "baseUrl", "apiKey"] as const;

export type AiField = (typeof AI_FIELDS)[number];

/** Config keys the crate understands, one per editable field. */
const CONFIG_KEYS: Record<AiField, string> = {
  provider: "ai.provider",
  model: "ai.model",
  baseUrl: "ai.base_url",
  apiKey: "ai.api_key",
};

/**
 * Providers the crate's factory can actually construct.
 *
 * The crate's validator also accepts `anthropic` and `ollama`, but the factory
 * cannot build the former and rewrites the latter to `local` — offering either
 * would hand the user a value that fails later, or one that silently changes.
 */
export const AI_PROVIDERS = ["openai", "openrouter", "azure-openai", "local"] as const;

export function getConfig(): Promise<ConfigDto> {
  return commands.getConfig();
}

export function setConfigValue(field: AiField, value: string): Promise<void> {
  return commands.setConfigValue({ key: CONFIG_KEYS[field], value }).then(() => undefined);
}

export function testAiConnection(): Promise<ConnectionTestResult> {
  return commands.testAiConnection();
}
