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
  test("publishes a matrix release for windows, linux, and both macOS architectures", () => {
    expect(workflowText).toContain("prepare-release:");
    expect(workflowText).toContain("publish-release:");
    expect(workflowText).toContain("strategy:");
    expect(workflowText).toContain("target: win-x64");
    expect(workflowText).toContain("target: linux-x64");
    expect(workflowText).toContain("target: macos-arm64");
    expect(workflowText).toContain("target: macos-x64");
    expect(workflowText).toContain("windows-2025");
    expect(workflowText).toContain("ubuntu-24.04");
    expect(workflowText).toContain("macos-15-intel");
  });

  test("accepts all pushed tags and gates publish steps behind normalized metadata", () => {
    expect(workflowText).toContain('- "*"');
    expect(workflowText).toContain("\"should_publish=true\"");
    expect(workflowText).toContain("\"should_publish=false\"");
    expect(workflowText).toContain("if: needs.prepare-release.outputs.should_publish == 'true'");
    expect(workflowText).toContain("tag_name: ${{ needs.prepare-release.outputs.tag_name }}");
  });

  test("does not require object storage or release-admin secrets", () => {
    expect(workflowText).not.toContain("MAOMI_RELEASE_UPLOAD_REQUEST_URL");
    expect(workflowText).not.toContain("MAOMI_RELEASE_ADMIN_BASE_URL");
    expect(workflowText).not.toContain("secrets.PUBLISH_KEY");
    expect(workflowText).not.toContain("release:manifest");
    expect(workflowText).not.toContain("release:upload");
  });
});
