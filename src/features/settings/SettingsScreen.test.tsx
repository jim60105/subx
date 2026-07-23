import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { ThemeProvider } from "../../theme/ThemeProvider";
import type { ConfigDto, ConnectionTestResult, ErrorDto, SetConfigRequest } from "../../types/ipc";
import { SettingsScreen } from "./SettingsScreen";

const SAVED_KEY_MASK = "****1234";

/** Config keys that map straight onto a `ConfigDto` field. */
const PLAIN_FIELDS: Record<string, "provider" | "model" | "baseUrl"> = {
  "ai.provider": "provider",
  "ai.model": "model",
  "ai.base_url": "baseUrl",
};

/**
 * A backend double that stores what it is told, so a test can assert on what
 * the screen reads back rather than only on what it sent.
 */
function mockBackend(initial: Partial<ConfigDto["ai"]> = {}) {
  const config: ConfigDto = {
    ai: {
      provider: "openai",
      model: "gpt-4.1-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKeyMasked: SAVED_KEY_MASK,
      apiKeySet: true,
      ...initial,
    },
  };
  const writes: SetConfigRequest[] = [];
  const rejections = new Map<string, ErrorDto>();
  let testResult: ConnectionTestResult = { ok: true, latencyMs: 128 };

  mockIPC((command, payload) => {
    if (command === "get_config") return structuredClone(config);

    if (command === "set_config_value") {
      const { request } = payload as { request: SetConfigRequest };
      const rejection = rejections.get(request.key);
      if (rejection) throw rejection;

      writes.push(request);
      const field = PLAIN_FIELDS[request.key];
      if (field) {
        config.ai[field] = request.value;
      } else {
        config.ai.apiKeyMasked = `****${request.value.slice(-4)}`;
        config.ai.apiKeySet = request.value !== "";
      }
      return null;
    }

    if (command === "test_ai_connection") return testResult;

    throw new Error(`unexpected command: ${command}`);
  });

  return {
    config,
    writes,
    reject: (key: string, error: ErrorDto) => rejections.set(key, error),
    setTestResult: (result: ConnectionTestResult) => {
      testResult = result;
    },
  };
}

function renderSettings() {
  return renderWithI18n(
    <ThemeProvider>
      <SettingsScreen />
    </ThemeProvider>,
  );
}

const model = () => screen.getByLabelText("Model");
const baseUrl = () => screen.getByLabelText("Base URL");
const apiKey = () => screen.getByLabelText("API key");
const saveButton = () => screen.getByRole("button", { name: "Save changes" });

describe("settings screen", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  afterEach(() => {
    clearMocks();
  });

  it("shows the stored API key only as a masked placeholder", async () => {
    mockBackend();
    renderSettings();

    await waitFor(() => expect(apiKey()).toHaveAttribute("placeholder", SAVED_KEY_MASK));
    expect(apiKey()).toHaveValue("");
  });

  it("marks the key as unconfigured when there is none", async () => {
    mockBackend({ apiKeyMasked: "", apiKeySet: false });
    renderSettings();

    await waitFor(() => expect(apiKey()).toHaveAttribute("placeholder", "No key configured"));
  });

  it("writes only the changed fields, provider first", async () => {
    const backend = mockBackend();
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    await userEvent.selectOptions(screen.getByLabelText("Provider"), "local");
    await userEvent.clear(model());
    await userEvent.type(model(), "llama3.1");
    await userEvent.click(saveButton());

    await waitFor(() => expect(backend.writes).toHaveLength(2));
    expect(backend.writes.map((write) => write.key)).toEqual(["ai.provider", "ai.model"]);
    expect(backend.writes[1].value).toBe("llama3.1");
  });

  it("replaces the key and shows only the new mask afterwards", async () => {
    const backend = mockBackend();
    renderSettings();
    await waitFor(() => expect(apiKey()).toHaveAttribute("placeholder", SAVED_KEY_MASK));

    await userEvent.type(apiKey(), "sk-brand-new-key-9876");
    await userEvent.click(saveButton());

    await waitFor(() => expect(apiKey()).toHaveAttribute("placeholder", "****9876"));
    expect(apiKey()).toHaveValue("");
    expect(backend.writes).toEqual([{ key: "ai.api_key", value: "sk-brand-new-key-9876" }]);
  });

  it("keeps a rejected value in its field while the other fields still save", async () => {
    const backend = mockBackend();
    backend.reject("ai.base_url", {
      code: "config.invalid_url",
      message: "Configuration error: Invalid URL",
      hintCode: "config.invalid_url.hint",
    });
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    await userEvent.clear(model());
    await userEvent.type(model(), "gpt-4o-mini");
    await userEvent.clear(baseUrl());
    await userEvent.type(baseUrl(), "not a url");
    await userEvent.click(saveButton());

    expect(await screen.findByText("That base URL is not valid.")).toBeInTheDocument();
    expect(screen.getByText("Use a full http:// or https:// address.")).toBeInTheDocument();
    expect(baseUrl()).toHaveValue("not a url");
    expect(baseUrl()).toHaveAttribute("aria-invalid", "true");

    // The valid field was written and reloaded from the backend regardless.
    expect(backend.writes).toEqual([{ key: "ai.model", value: "gpt-4o-mini" }]);
    expect(model()).toHaveValue("gpt-4o-mini");
  });

  it("reports a successful connection test with its latency", async () => {
    mockBackend();
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("Connection succeeded in 128 ms.")).toBeInTheDocument();
  });

  it("localizes a failed connection test and points at the fields", async () => {
    const backend = mockBackend();
    backend.setTestResult({
      ok: false,
      error: {
        code: "core.ai_service",
        message: "OpenAI API error 401: invalid_api_key",
        hintCode: "config.connection_test.hint",
      },
    });
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("The AI service could not be reached.")).toBeInTheDocument();
    expect(
      screen.getByText("Check the provider, base URL and API key, then test again."),
    ).toBeInTheDocument();
    expect(screen.getByText("OpenAI API error 401: invalid_api_key")).toBeInTheDocument();
  });

  it("saves pending edits before testing, and skips the test when a write is rejected", async () => {
    const backend = mockBackend();
    backend.reject("ai.model", { code: "config.invalid_model", message: "bad model" });
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    await userEvent.clear(model());
    await userEvent.type(model(), " ");
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("That model name is not valid.")).toBeInTheDocument();
    expect(screen.queryByText(/Connection succeeded/)).not.toBeInTheDocument();
  });

  it("picks up an external edit when the window regains focus", async () => {
    const backend = mockBackend();
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    backend.config.ai.model = "changed-by-the-cli";
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(model()).toHaveValue("changed-by-the-cli"));
  });

  it("does not discard a field the user is editing when re-fetching", async () => {
    const backend = mockBackend();
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    await userEvent.clear(model());
    await userEvent.type(model(), "half-typed");
    backend.config.ai.model = "changed-by-the-cli";
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(backend.config.ai.baseUrl).toBeTruthy());
    expect(model()).toHaveValue("half-typed");
  });

  it("ignores a stale focus refetch that resolves after a save's own refetch", async () => {
    const config: ConfigDto = {
      ai: {
        provider: "openai",
        model: "gpt-4.1-mini",
        baseUrl: "https://api.openai.com/v1",
        apiKeyMasked: SAVED_KEY_MASK,
        apiKeySet: true,
      },
    };
    // When deferred, every get_config resolves only when the test says so, in
    // the order the test chooses — the whole point is to force out-of-order.
    const pendingGets: Array<(value: ConfigDto) => void> = [];
    let deferGets = false;

    mockIPC((command, payload) => {
      if (command === "get_config") {
        if (!deferGets) return structuredClone(config);
        return new Promise<ConfigDto>((resolve) => pendingGets.push(resolve));
      }
      if (command === "set_config_value") {
        const { request } = payload as { request: SetConfigRequest };
        if (request.key === "ai.model") config.ai.model = request.value;
        return null;
      }
      throw new Error(`unexpected command: ${command}`);
    });

    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    deferGets = true;

    // A focus refetch starts and is left in flight — this is the "stale" one.
    fireEvent.focus(window);
    await waitFor(() => expect(pendingGets).toHaveLength(1));

    // The user edits and saves; the save's own refetch is the newer request.
    await userEvent.clear(model());
    await userEvent.type(model(), "saved-model");
    void fireEvent.click(saveButton());
    await waitFor(() => expect(pendingGets).toHaveLength(2));

    // Resolve the save's refetch (newer) first: the save lands and the screen
    // settles on the saved value.
    await act(async () => {
      pendingGets[1](structuredClone(config)); // model === "saved-model"
    });
    expect(model()).toHaveValue("saved-model");

    // The stale response carries the pre-save value and resolves last, flushed
    // fully. Applying it would revert the field to "gpt-4.1-mini"; the sequence
    // guard must drop it so the saved value stands.
    await act(async () => {
      pendingGets[0]({ ...config, ai: { ...config.ai, model: "gpt-4.1-mini" } });
    });
    expect(model()).toHaveValue("saved-model");
  });

  it("renders the shell's shared language and theme pickers", async () => {
    mockBackend();
    renderSettings();

    await waitFor(() => expect(screen.getByLabelText("Language")).toBeInTheDocument());
    expect(screen.getByLabelText("Theme")).toBeInTheDocument();
    expect(screen.getByLabelText("Theme")).toHaveValue("system");
  });
});
