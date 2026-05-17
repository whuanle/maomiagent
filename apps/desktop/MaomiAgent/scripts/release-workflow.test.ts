import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "bun:test";

const workflowPath = path.resolve(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  ".github",
  "workflows",
  "desktop-release.yml",
);
const workflowText = readFileSync(workflowPath, "utf8");

describe("desktop-release workflow", () => {
  test("runs inside the build environment and sources upload auth from PUBLISH_KEY", () => {
    expect(workflowText).toContain("environment: build");
    expect(workflowText).toContain("secrets.PUBLISH_KEY");
  });

  test("accepts all pushed tags and gates publish steps behind normalized metadata", () => {
    expect(workflowText).toContain('- "*"');
    expect(workflowText).toContain("\"should_publish=true\"");
    expect(workflowText).toContain("\"should_publish=false\"");
    expect(workflowText).toContain("if: steps.release.outputs.should_publish == 'true'");
  });
});
