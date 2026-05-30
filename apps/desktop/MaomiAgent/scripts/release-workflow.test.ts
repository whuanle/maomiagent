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
    expect(workflowText).toContain("publish-npm:");
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
    expect(workflowText).toContain("\"npm_version=$npmVersion\"");
    expect(workflowText).toContain("\"npm_version=\"");
    expect(workflowText).toContain("if: needs.prepare-release.outputs.should_publish == 'true'");
    expect(workflowText).toContain("tag_name: ${{ needs.prepare-release.outputs.tag_name }}");
  });

  test("uploads portable artifacts and publishes release plus npm packages", () => {
    expect(workflowText).toContain("path: apps/desktop/MaomiAgent/artifacts/**/*");
    expect(workflowText).toContain("files: release-assets/release/*");
    expect(workflowText).toContain("runs-on: ubuntu-24.04");
    expect(workflowText).toContain("id-token: write");
    expect(workflowText).toContain("uses: actions/setup-node@v4");
    expect(workflowText).toContain("node-version: 22");
    expect(workflowText).toContain("registry-url: https://registry.npmjs.org");
    expect(workflowText).toContain("path: release-assets");
    expect(workflowText).toContain("Remove existing release assets for tag");
    expect(workflowText).toContain("https://api.github.com/repos/${{ github.repository }}/releases/tags/${{ needs.prepare-release.outputs.tag_name }}");
    expect(workflowText).toContain("Invoke-RestMethod -Headers $headers -Method Delete -Uri \"https://api.github.com/repos/${{ github.repository }}/releases/assets/$($asset.id)\"");
    expect(workflowText).toContain(
      "run: npm install --prefix ./packages/maomiagent-npm --ignore-scripts",
    );
    expect(workflowText).toContain("run: node scripts/assemble-maomiagent-npm-package.mjs");
    expect(workflowText).toContain(
      "MAOMI_AGENT_NPM_ARTIFACT_ROOT: ${{ github.workspace }}/release-assets/npm",
    );
    expect(workflowText).toContain(
      "MAOMI_AGENT_NPM_VERSION: ${{ needs.prepare-release.outputs.npm_version }}",
    );
    expect(workflowText).not.toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(workflowText).toContain(
      "npm publish ./packages/maomiagent-npm --access public --provenance",
    );
    expect(workflowText).not.toContain("release-assets/*.tar.zst");
    expect(workflowText).not.toContain("release-assets/*update.json");
  });

  test("does not require object storage or release-admin secrets", () => {
    expect(workflowText).not.toContain("MAOMI_RELEASE_UPLOAD_REQUEST_URL");
    expect(workflowText).not.toContain("MAOMI_RELEASE_ADMIN_BASE_URL");
    expect(workflowText).not.toContain("secrets.PUBLISH_KEY");
    expect(workflowText).not.toContain("release:manifest");
    expect(workflowText).not.toContain("release:upload");
  });
});
