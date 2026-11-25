/**
 * Content security policy assertions for the sync preview's media (design D7).
 *
 * The preview plays local media from the backend's loopback server, whose
 * port is chosen by the OS at runtime, so `media-src` has to admit any port on
 * `127.0.0.1`; the per-file token is what authorizes access. Nothing else may
 * reach loopback, and Tauri's asset protocol stays off (design D1).
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONFIG_PATH = path.resolve(__dirname, "..", "src-tauri", "tauri.conf.json");

type TauriConfig = {
  app: { security: { csp: string; assetProtocol?: unknown } };
};

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as TauriConfig;

/** Directive name → its source list. */
function directives(csp: string): Map<string, string[]> {
  const parsed = new Map<string, string[]>();
  for (const directive of csp.split(";")) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name) parsed.set(name, sources);
  }
  return parsed;
}

describe("the content policy admits loopback media only", () => {
  const policy = directives(config.app.security.csp);

  it("lists exactly 'self' and any loopback port under media-src", () => {
    expect(new Set(policy.get("media-src"))).toEqual(new Set(["'self'", "http://127.0.0.1:*"]));
  });

  it("names 127.0.0.1 in no other directive", () => {
    const others = [...policy]
      .filter(([name, sources]) => name !== "media-src" && sources.some((source) => source.includes("127.0.0.1")))
      .map(([name]) => name);
    expect(others).toEqual([]);
  });

  it("keeps the asset protocol disabled", () => {
    expect(config.app.security.assetProtocol).toBeUndefined();
  });
});
