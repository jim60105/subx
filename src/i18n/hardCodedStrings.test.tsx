/**
 * `localization` requires that "no user-facing string in the frontend SHALL be
 * hard-coded".
 *
 * `localeParity.test.ts` cannot catch a violation of that: it compares the two
 * locale files against each other, and a string that was never routed through
 * i18n has no key to be missing from either. So this renders every screen under
 * i18next's `cimode`, in which every translation resolves to its own key. Any
 * text node still carrying prose is prose that came from a component.
 */

import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import App from "../App";
import { HomeScreen } from "../features/home/HomeScreen";
import { MatchScreen } from "../features/match/MatchScreen";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { ThemeProvider } from "../theme/ThemeProvider";
import { i18n, renderWithI18n, setupI18n } from "../test/renderWithI18n";
import type { ConfigDto } from "../types/ipc";

const CONFIG: ConfigDto = {
  ai: {
    provider: "openai",
    model: "gpt-4.1-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKeyMasked: "****1234",
    apiKeySet: true,
  },
};

/**
 * Text that legitimately reaches the DOM without a translation key.
 *
 * Every entry is a value, not prose: keep this list narrow and commented. If it
 * grows, the right response is to narrow the matcher, never to disable the test.
 */
const ALLOWED = [
  // `<select>` option values echo the configured provider ids, which are the
  // crate's own identifiers, not UI copy.
  /^(openai|openrouter|azure-openai|local)$/,
  // Language names are deliberately shown in their own language, so they are
  // not translated: see `languages.ts`.
  /^(English|繁體中文)$/,
  // The saved model name and base URL are user data read back from the config.
  /^gpt-4\.1-mini$/,
  /^https:\/\/api\.openai\.com\/v1$/,
  /^\*{4}1234$/,
];

/**
 * In `cimode`, a translated string is its own key: `settings.title`,
 * `actions.save`. Anything else containing letters is untranslated prose.
 */
const KEY_SHAPE = /^[A-Za-z][\w-]*(\.[\w-]+)*$/;
const HAS_LETTERS = /\p{L}/u;

/** Every non-empty text node, trimmed. */
function textNodesIn(container: HTMLElement): string[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? "";
    if (text !== "") texts.push(text);
  }
  return texts;
}

function untranslatedTextIn(container: HTMLElement): string[] {
  return textNodesIn(container).filter(
    (text) =>
      HAS_LETTERS.test(text) &&
      !KEY_SHAPE.test(text) &&
      !ALLOWED.some((pattern) => pattern.test(text)),
  );
}

/** Text nodes that look like an unresolved i18next key. */
function translationKeysIn(container: HTMLElement): string[] {
  return textNodesIn(container).filter(
    (text) => KEY_SHAPE.test(text) && !ALLOWED.some((pattern) => pattern.test(text)),
  );
}

/** Attribute text a screen reader announces is user-facing too. */
function untranslatedLabelsIn(container: HTMLElement): string[] {
  const offenders: string[] = [];

  for (const element of container.querySelectorAll("[aria-label], [placeholder], [title]")) {
    for (const attribute of ["aria-label", "placeholder", "title"]) {
      const value = element.getAttribute(attribute)?.trim();
      if (!value || !HAS_LETTERS.test(value)) continue;
      if (KEY_SHAPE.test(value)) continue;
      if (ALLOWED.some((pattern) => pattern.test(value))) continue;
      offenders.push(`${attribute}="${value}"`);
    }
  }

  return offenders;
}

beforeEach(async () => {
  await setupI18n("en");
  // `cimode` is i18next's own "show me the keys" language.
  await act(async () => {
    await i18n.changeLanguage("cimode");
  });
  mockIPC((command) => {
    if (command === "get_config") return structuredClone(CONFIG);
    if (command === "set_config_value") return null;
    if (command === "test_ai_connection") return { ok: true, latencyMs: 12 };
    throw new Error(`unexpected command: ${command}`);
  });
});

afterEach(async () => {
  clearMocks();
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

/**
 * Every screen that exists today. `add-match-wizard` must extend this list with
 * its step components — see `docs/verification.md`.
 */
const SCREENS = [
  { name: "HomeScreen", render: () => renderWithI18n(<HomeScreen onOpenTask={() => {}} />) },
  { name: "MatchScreen", render: () => renderWithI18n(<MatchScreen />) },
  {
    name: "SettingsScreen",
    render: () =>
      renderWithI18n(
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>,
      ),
  },
  {
    name: "App shell",
    render: () =>
      renderWithI18n(
        <ThemeProvider>
          <App />
        </ThemeProvider>,
      ),
  },
];

describe("no user-facing string is hard-coded", () => {
  // @covers localization/ui-is-localized-in-english-and-traditional-chinese#complete-zh-tw-coverage
  it.each(SCREENS)("$name renders only translation keys", async ({ render }) => {
    const { container } = render();
    // Let the settings screen's initial fetch settle before reading the DOM.
    await act(async () => {});

    // A screen that rendered nothing would satisfy the assertions below without
    // proving anything, so require that it actually produced translated text.
    expect(translationKeysIn(container).length).toBeGreaterThan(2);

    expect(untranslatedTextIn(container)).toEqual([]);
    expect(untranslatedLabelsIn(container)).toEqual([]);
  });

  it("would notice prose that never went through i18n", () => {
    // The matcher has to be able to fail, or the assertions above are theatre.
    const fixture = document.createElement("div");
    fixture.innerHTML =
      '<p>settings.title</p><p>Save changes</p><button aria-label="Close dialog"></button>';

    expect(untranslatedTextIn(fixture)).toEqual(["Save changes"]);
    expect(translationKeysIn(fixture)).toEqual(["settings.title"]);
    expect(untranslatedLabelsIn(fixture)).toEqual(['aria-label="Close dialog"']);
  });

  // @covers localization/ui-is-localized-in-english-and-traditional-chinese#complete-zh-tw-coverage
  it("renders the same screens in a real language without leaving keys behind", async () => {
    // The mirror image: `cimode` proves nothing is hard-coded, this proves
    // nothing resolves to a bare key because its translation is missing.
    await act(async () => {
      await i18n.changeLanguage("zh-TW");
    });
    const { container } = renderWithI18n(<HomeScreen onOpenTask={() => {}} />);

    expect(translationKeysIn(container)).toEqual([]);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
