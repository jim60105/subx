/**
 * The CI file is a gate too, so it is asserted like one (design D4).
 *
 * This does not run the pipeline — it checks the pipeline is armed: every gate
 * command is present, it triggers on push (this project has no pull-request
 * flow), and no gate step is allowed to fail quietly.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = fs.readFileSync(
  path.resolve(__dirname, "..", ".github", "workflows", "ci.yml"),
  "utf8",
);

describe("continuous integration runs every gate", () => {
  // @covers verification-gates/continuous-integration-runs-every-gate#all-gates-run-on-every-push
  it("invokes the three gate commands", () => {
    // Frontend coverage, backend coverage, traceability.
    expect(WORKFLOW).toMatch(/npm run test:coverage/);
    expect(WORKFLOW).toMatch(/cargo cov/);
    expect(WORKFLOW).toMatch(/node scripts\/check-spec-coverage\.mjs/);
  });

  it("triggers on push and not on pull_request", () => {
    // No pull-request flow: push is the only trigger. A `pull_request` trigger
    // here would quietly contradict the project's stated workflow.
    expect(WORKFLOW).toMatch(/^on:\s*push\s*$/m);
    expect(WORKFLOW).not.toMatch(/pull_request:/);
  });

  // @covers verification-gates/continuous-integration-runs-every-gate#no-gate-is-advisory
  it("suppresses no gate's exit status", () => {
    expect(WORKFLOW).not.toMatch(/continue-on-error/);
    // No `|| true` swallowing a gate's failure.
    expect(WORKFLOW).not.toMatch(/\|\|\s*true/);
  });
});
