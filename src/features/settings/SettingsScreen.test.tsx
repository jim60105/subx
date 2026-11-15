import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../../App";
import { SUPPORTED_LANGUAGES } from "../../i18n/languages";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { ThemeProvider } from "../../theme/ThemeProvider";
import type { ConfigDto, ConnectionTestResult, ErrorDto, SetConfigRequest } from "../../types/ipc";
import { DEFAULT_CONFIG } from "./useSettingsForm";
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
  let testResult: ConnectionTestResult = { ok: true, latencyMs: 128, error: null };

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

/**
 * A backend double where the strict `get_config` fails (the env-var overlay
 * scenario), `get_config_tolerant` mirrors what is on disk (updated by
 * writes), and `set_config_value` persists the edited fields.
 */
function mockStrictFailingBackend(options: { strictAlwaysFails?: boolean } = {}) {
  const { strictAlwaysFails = false } = options;
  const config: ConfigDto = {
    ai: {
      provider: "openai",
      model: "gpt-4.1-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKeyMasked: "",
      apiKeySet: false,
    },
  };
  const writes: SetConfigRequest[] = [];
  let strictCalls = 0;

  mockIPC((command, payload) => {
    if (command === "get_config") {
      strictCalls += 1;
      if (strictAlwaysFails || strictCalls === 1) {
        throw {
          code: "core.config",
          message: "Configuration error: environment variable overlay",
          hintCode: "core.config.hint",
        } as ErrorDto;
      }
      return structuredClone(config);
    }
    if (command === "get_config_tolerant") return structuredClone(config);
    if (command === "set_config_value") {
      const { request } = payload as { request: SetConfigRequest };
      writes.push(request);
      if (request.key === "ai.provider") config.ai.provider = request.value;
      if (request.key === "ai.model") config.ai.model = request.value;
      if (request.key === "ai.base_url") config.ai.baseUrl = request.value;
      if (request.key === "ai.api_key") {
        config.ai.apiKeyMasked = `****${request.value.slice(-4)}`;
        config.ai.apiKeySet = request.value !== "";
      }
      return null;
    }
    throw new Error(`unexpected command: ${command}`);
  });

  return { config, writes };
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
const apiKey = () => screen.getByLabelText("API key", { selector: "input" });
const queryApiKey = () => screen.queryByLabelText("API key", { selector: "input" });
const replaceButton = () => screen.getByRole("button", { name: "Replace API key" });
const keepButton = () => screen.getByRole("button", { name: "Keep current key" });
/** The heading row (`<header>`) of the section whose title is `title`. */
const sectionHeader = (title: string) =>
  screen.getByRole("heading", { level: 2, name: title }).closest("header") as HTMLElement;
/** The section whose title is `title`. */
const section = (title: string) =>
  screen.getByRole("heading", { level: 2, name: title }).closest("section") as HTMLElement;
const saveButton = () => screen.getByRole("button", { name: "Save changes" });

describe("settings screen", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  afterEach(() => {
    clearMocks();
  });

  // @covers settings-management/api-key-is-masked-and-write-only#masked-display
  it("shows a configured API key only in masked form, with no input until Replace", async () => {
    mockBackend();
    renderSettings();

    expect(await screen.findByText(SAVED_KEY_MASK)).toBeVisible();
    expect(queryApiKey()).not.toBeInTheDocument();
    expect(replaceButton()).toHaveAccessibleDescription(/^\*{4}1234 Stored keys are never shown/);
    // The hint survives for assistive technology only.
    expect(
      screen.getByText(/Stored keys are never shown/),
    ).toHaveClass("visually-hidden");
  });

  it("reveals an empty, focused input when Replace is activated", async () => {
    mockBackend();
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Replace API key" }));

    expect(apiKey()).toHaveValue("");
    expect(apiKey()).toHaveFocus();
    expect(apiKey()).not.toHaveAttribute("placeholder");
    // Neither the cleartext nor the mask is put into the input.
    expect(apiKey()).not.toHaveValue(SAVED_KEY_MASK);
  });

  it("discards the draft and restores the mask when the current key is kept", async () => {
    const backend = mockBackend();
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Replace API key" }));
    await userEvent.type(apiKey(), "sk-draft-to-discard");
    expect(saveButton()).toBeEnabled();

    await userEvent.click(keepButton());

    expect(queryApiKey()).not.toBeInTheDocument();
    expect(screen.getByText(SAVED_KEY_MASK)).toBeVisible();
    expect(replaceButton()).toHaveFocus();
    expect(saveButton()).toBeDisabled();
    // No input on the page, and no text, carries a key the user did not type.
    const inputValues = Array.from(document.querySelectorAll("input"), (input) => input.value);
    expect(inputValues.filter((value) => value.startsWith("sk-"))).toEqual([]);
    expect(document.body.textContent).not.toMatch(/sk-/);
    expect(backend.writes).toEqual([]);
  });

  it("shows the empty key input directly when no key is configured", async () => {
    mockBackend({ apiKeyMasked: "", apiKeySet: false });
    renderSettings();

    await waitFor(() => expect(apiKey()).toHaveAttribute("placeholder", "No key configured"));
    expect(apiKey()).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Replace API key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep current key" })).not.toBeInTheDocument();
  });

  it("closes the input on the mask once the first key is saved", async () => {
    const backend = mockBackend({ apiKeyMasked: "", apiKeySet: false });
    renderSettings();
    await waitFor(() => expect(apiKey()).toHaveAttribute("placeholder", "No key configured"));

    await userEvent.type(apiKey(), "sk-first-key-4321");
    await userEvent.click(saveButton());

    expect(await screen.findByText("****4321")).toBeVisible();
    expect(queryApiKey()).not.toBeInTheDocument();
    expect(replaceButton()).toBeInTheDocument();
    expect(backend.writes).toEqual([{ key: "ai.api_key", value: "sk-first-key-4321" }]);
  });

  it("keeps an open Replace input, and its draft, across a window-focus refetch", async () => {
    mockBackend();
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Replace API key" }));

    window.dispatchEvent(new Event("focus"));
    await act(async () => {});
    expect(apiKey()).toHaveValue("");

    await userEvent.type(apiKey(), "sk-half-pasted");
    window.dispatchEvent(new Event("focus"));
    await act(async () => {});
    expect(apiKey()).toHaveValue("sk-half-pasted");
  });

  it("keeps a rejected key visible in its input with the error", async () => {
    const backend = mockBackend();
    backend.reject("ai.api_key", {
      code: "config.invalid_api_key",
      message: "bad key",
      hintCode: null,
    });
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Replace API key" }));
    await userEvent.type(apiKey(), "sk-rejected");
    await userEvent.click(saveButton());

    await waitFor(() => expect(apiKey()).toHaveAttribute("aria-invalid", "true"));
    expect(apiKey()).toHaveValue("sk-rejected");
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

  // @covers settings-management/api-key-is-masked-and-write-only#replacing-the-key
  it("replaces the key and shows only the new mask afterwards", async () => {
    const backend = mockBackend();
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Replace API key" }));

    await userEvent.type(apiKey(), "sk-brand-new-key-9876");
    await userEvent.click(saveButton());

    expect(await screen.findByText("****9876")).toBeVisible();
    expect(queryApiKey()).not.toBeInTheDocument();
    expect(replaceButton()).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("sk-brand-new-key-9876");
    expect(backend.writes).toEqual([{ key: "ai.api_key", value: "sk-brand-new-key-9876" }]);
  });

  // @covers settings-management/validated-writes-with-field-level-errors#invalid-value-is-rejected
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

  // @covers settings-management/ai-connection-test#successful-test
  it("reports a successful connection test with its latency", async () => {
    mockBackend();
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("Connection succeeded in 128 ms.")).toBeInTheDocument();
  });

  it("reports a success beside the test action, described rather than explained", async () => {
    mockBackend();
    const { container } = renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    const testButton = screen.getByRole("button", { name: "Test connection" });
    const description = "Saves your changes, then sends one short request to the provider.";
    expect(testButton).toHaveAccessibleDescription(description);
    expect(screen.getByText(description)).toHaveClass("visually-hidden");

    await userEvent.click(testButton);

    const status = await screen.findByRole("status");
    expect(container.querySelector(".settings-test__action")).toContainElement(status);
    expect(status).toHaveTextContent("128 ms");
    expect(within(status).getByText("128 ms")).toBeVisible();
  });

  // @covers settings-management/ai-connection-test#failing-test
  it("localizes a failed connection test and points at the fields", async () => {
    const backend = mockBackend();
    backend.setTestResult({
      ok: false,
      latencyMs: null,
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
    backend.reject("ai.model", {
      code: "config.invalid_model",
      message: "bad model",
      hintCode: null,
    });
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    await userEvent.clear(model());
    await userEvent.type(model(), " ");
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("That model name is not valid.")).toBeInTheDocument();
    expect(screen.queryByText(/Connection succeeded/)).not.toBeInTheDocument();
  });

  // @covers settings-management/settings-screen-edits-the-shared-cli-configuration#external-changes-are-picked-up
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

  it("labels where each section's values are stored at its heading", async () => {
    mockBackend();
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    expect(within(sectionHeader("AI provider")).getByText(/config\.toml/)).toBeVisible();
    expect(within(sectionHeader("Appearance and language")).getByText("This app only")).toBeVisible();
    // The sentences the labels replace are gone.
    expect(screen.queryByText(/Written to the same configuration file/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Stored in this app only/)).not.toBeInTheDocument();
    // The page title stays for assistive technology; the breadcrumb shows it.
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toHaveClass("visually-hidden");
  });

  it("lays the language and theme options out inline", async () => {
    mockBackend();
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));
    const preferences = section("Appearance and language");

    const language = within(preferences).getByRole("group", { name: "Language" });
    const theme = within(preferences).getByRole("group", { name: "Theme" });
    expect(within(language).getAllByRole("radio")).toHaveLength(SUPPORTED_LANGUAGES.length);
    expect(within(theme).getAllByRole("radio")).toHaveLength(3);
    expect(within(language).getByRole("radio", { name: "English" })).toBeChecked();
    expect(within(theme).getByRole("radio", { name: "Follow system" })).toBeChecked();

    expect(within(preferences).queryByRole("listbox")).not.toBeInTheDocument();
    expect(within(preferences).queryByRole("combobox")).not.toBeInTheDocument();
    expect(preferences.querySelector("[aria-haspopup]")).toBeNull();
  });

  // @covers settings-management/gui-local-preferences-on-the-same-screen#preferences-do-not-touch-the-cli-config
  it("never writes to the CLI config when a preference changes", async () => {
    const backend = mockBackend();
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));
    // The only writes so far are none: nothing has been saved.
    expect(backend.writes).toHaveLength(0);

    // Change the theme, then the language — both GUI-local preferences.
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await userEvent.click(screen.getByRole("radio", { name: "正體中文" }));

    // The preference change persists to GUI-local storage, not the CLI config.
    expect(window.localStorage.getItem("subx.theme")).toBe("dark");
    expect(await screen.findByRole("radio", { name: "深色" })).toBeChecked();
    // `set_config_value` is the only path to the CLI config file, and it must
    // not have been reached.
    expect(backend.writes).toEqual([]);
  });

  it("keeps the inline theme choice and the title-bar dropdown in step", async () => {
    const commands: string[] = [];
    mockIPC((command) => {
      commands.push(command);
      if (command === "get_build_info") return { version: "0.4.0", gitHash: "abc1234", debug: true };
      if (command === "get_config") {
        return {
          ai: {
            provider: "openai",
            model: "gpt-4.1-mini",
            baseUrl: "https://api.openai.com/v1",
            apiKeyMasked: SAVED_KEY_MASK,
            apiKeySet: true,
          },
        } satisfies ConfigDto;
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const { container } = renderWithI18n(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    await userEvent.click(await screen.findByRole("radio", { name: "Dark" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("subx.theme")).toBe("dark");
    const header = container.querySelector(".app-header") as HTMLElement;
    expect(within(header).getByLabelText("Theme")).toHaveValue("dark");
    expect(within(header).getByRole("button", { name: "Dark" })).toBeInTheDocument();
    expect(commands).not.toContain("set_config_value");
  });

  // @covers settings-management/a-failed-configuration-load-does-not-block-the-settings-form#form-stays-editable-when-the-initial-read-fails
  it("keeps the form editable when the initial read fails", async () => {
    const backend = mockStrictFailingBackend();
    renderSettings();

    // The tolerant read's values prefill the form; the error notice stays
    // visible above it as a non-blocking banner.
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));
    expect(await screen.findByText("The configuration is invalid.")).toBeInTheDocument();
    expect(screen.getByText("Review the AI settings and try again.")).toBeInTheDocument();

    // The user can edit and save a field even though the strict read failed.
    await userEvent.clear(model());
    await userEvent.type(model(), "gpt-4o-mini");
    await userEvent.click(saveButton());

    await waitFor(() => expect(backend.writes).toEqual([{ key: "ai.model", value: "gpt-4o-mini" }]));
    expect(model()).toHaveValue("gpt-4o-mini");
  });

  // @covers settings-management/a-failed-configuration-load-does-not-block-the-settings-form#a-successful-save-is-not-masked-by-a-failing-re-read
  it("does not mask a successful save when the post-save re-read fails", async () => {
    const backend = mockStrictFailingBackend({ strictAlwaysFails: true });
    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    await userEvent.clear(model());
    await userEvent.type(model(), "gpt-4o-mini");
    await userEvent.click(saveButton());

    // Every write lands on disk; the strict re-read still fails, but the
    // screen refreshes from the tolerant read instead of reporting a save
    // failure or leaving a stale save error.
    await waitFor(() => expect(backend.writes).toEqual([{ key: "ai.model", value: "gpt-4o-mini" }]));
    await waitFor(() => expect(model()).toHaveValue("gpt-4o-mini"));
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("skips the focus refetch while the initial bootstrap is in flight", async () => {
    const defaults: ConfigDto = {
      ai: {
        provider: "openai",
        model: "gpt-4.1-mini",
        baseUrl: "https://api.openai.com/v1",
        apiKeyMasked: "",
        apiKeySet: false,
      },
    };
    const pendingGets: Array<{ resolve: (value: ConfigDto) => void; reject: (error: ErrorDto) => void }> = [];

    mockIPC((command) => {
      if (command === "get_config") {
        return new Promise<ConfigDto>((resolve, reject) => {
          pendingGets.push({ resolve, reject });
        });
      }
      if (command === "get_config_tolerant") return structuredClone(defaults);
      throw new Error(`unexpected command: ${command}`);
    });

    renderSettings();

    // The initial strict read is in flight; a focus event must not start a
    // second strict read — that would bump the load sequence and orphan the
    // in-flight tolerant fallback.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(pendingGets).toHaveLength(1));

    // Settle the initial read as a failure; the fallback fills the form with
    // the tolerant read's values.
    await act(async () => {
      pendingGets[0].reject({
        code: "core.config",
        message: "Configuration error: environment variable overlay",
        hintCode: "core.config.hint",
      });
    });
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));
    expect(screen.getByText("The configuration is invalid.")).toBeInTheDocument();
  });

  it("shows a non-blocking warning when a strict reload fails after a config is loaded", async () => {
    const config: ConfigDto = {
      ai: {
        provider: "openai",
        model: "gpt-4.1-mini",
        baseUrl: "https://api.openai.com/v1",
        apiKeyMasked: "",
        apiKeySet: false,
      },
    };
    let strictCalls = 0;
    mockIPC((command) => {
      if (command === "get_config") {
        strictCalls += 1;
        // The first (initial) strict read succeeds; later refetches fail — the
        // env-var overlay scenario after a config is already on screen.
        if (strictCalls > 1) {
          throw {
            code: "core.config",
            message: "Configuration error: environment variable overlay",
            hintCode: "core.config.hint",
          } as ErrorDto;
        }
        return structuredClone(config);
      }
      if (command === "get_config_tolerant") return structuredClone(config);
      throw new Error(`unexpected command: ${command}`);
    });

    renderSettings();
    await waitFor(() => expect(model()).toHaveValue("gpt-4.1-mini"));

    // A focus-triggered refetch whose strict read fails: the screen keeps the
    // loaded value and shows a warning instead of reverting to the tolerant or
    // default config.
    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByText("The configuration is invalid.")).toBeInTheDocument();
    expect(model()).toHaveValue("gpt-4.1-mini");
  });
});

describe("DEFAULT_CONFIG mirror", () => {
  it("matches the crate's default AI configuration", () => {
    // Pins the frontend fallback against the values the crate's
    // `Config::default().ai` carries, so the mirror cannot drift silently.
    expect(DEFAULT_CONFIG.ai.provider).toBe("openai");
    expect(DEFAULT_CONFIG.ai.model).toBe("gpt-4.1-mini");
    expect(DEFAULT_CONFIG.ai.baseUrl).toBe("https://api.openai.com/v1");
    expect(DEFAULT_CONFIG.ai.apiKeyMasked).toBe("");
    expect(DEFAULT_CONFIG.ai.apiKeySet).toBe(false);
  });
});
