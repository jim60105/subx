/**
 * Dev-mode arming assertion.
 *
 * Tauri picks its environment from one flag: tauri's build script sets
 * `dev = !custom-protocol`, and `tauri dev` passes `--no-default-features` so
 * that flag lands off. When `custom-protocol` is instead switched on at the
 * `tauri` dependency, every build is a production build, so the dev window
 * loads the embedded `../dist` bundle — which `npm run dev:app` never rebuilds —
 * and freshly merged frontend code never appears. That failure is silent and
 * was observed twice, so the manifest shape is pinned here.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(__dirname, "..");
const MANIFEST = fs.readFileSync(
  path.join(REPO, "src-tauri", "Cargo.toml"),
  "utf8",
);
const PACKAGE_JSON = JSON.parse(
  fs.readFileSync(path.join(REPO, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

/** The feature list of a `[dependencies]`-style `name = { version = .. }` entry. */
function dependencyFeatures(table: string, name: string): string[] {
  const line = table
    .split("\n")
    .find((candidate) => candidate.trimStart().startsWith(`${name} = `));
  if (!line) throw new Error(`no ${name} dependency in the manifest`);
  const features = /features\s*=\s*\[([^\]]*)\]/.exec(line);
  if (!features) return [];
  return features[1]
    .split(",")
    .map((entry) => entry.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

describe("tauri dev builds in dev mode", () => {
  it("does not switch custom-protocol on at the tauri dependency", () => {
    expect(dependencyFeatures(MANIFEST, "tauri")).not.toContain(
      "custom-protocol",
    );
  });

  it("declares custom-protocol as a default feature, enabled through tauri", () => {
    const featuresTable = MANIFEST.split(/^\[features\]$/m)[1]?.split(/^\[/m)[0];
    expect(featuresTable).toBeDefined();
    expect(featuresTable).toMatch(/^default\s*=\s*\[\s*"custom-protocol"\s*\]/m);
    expect(featuresTable).toMatch(/^custom-protocol\s*=\s*\[\s*"tauri\/custom-protocol"\s*\]/m);
  });

  it("keeps a launcher that runs tauri dev, the command that disables defaults", () => {
    expect(PACKAGE_JSON.scripts["dev:app"]).toBe("scripts/dev.sh");
    const devScript = fs.readFileSync(path.join(REPO, "scripts", "dev.sh"), "utf8");
    expect(devScript).toContain("npm run tauri dev");
  });
});
