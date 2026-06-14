import { describe, expect, test } from "bun:test";

import {
  applyWorkspacePatchUpdateChunks,
  type WorkspacePatchUpdateChunk,
} from "./workspace-patch-matcher";

describe("applyWorkspacePatchUpdateChunks", () => {
  test("matches update hunks exactly", () => {
    const chunks: WorkspacePatchUpdateChunk[] = [{
      oldLines: ["beta"],
      newLines: ["BETA"],
    }];

    expect(applyWorkspacePatchUpdateChunks({
      source: ["alpha", "beta", "gamma"].join("\n"),
      filePath: "demo.txt",
      chunks,
    }).content).toBe(["alpha", "BETA", "gamma", ""].join("\n"));
  });

  test("matches with trailing whitespace drift via trimEnd fallback", () => {
    const chunks: WorkspacePatchUpdateChunk[] = [{
      oldLines: ["beta   "],
      newLines: ["BETA"],
    }];

    expect(applyWorkspacePatchUpdateChunks({
      source: ["alpha", "beta", "gamma"].join("\n"),
      filePath: "demo.txt",
      chunks,
    }).content).toContain("BETA");
  });

  test("matches with context seek before applying a repeated block", () => {
    const chunks: WorkspacePatchUpdateChunk[] = [{
      changeContext: "## second",
      oldLines: ["item", "tail"],
      newLines: ["item", "tail+", "tail"],
    }];

    expect(applyWorkspacePatchUpdateChunks({
      source: ["## first", "item", "tail", "## second", "item", "tail"].join("\n"),
      filePath: "demo.txt",
      chunks,
    }).content).toContain(["## second", "item", "tail+", "tail"].join("\n"));
  });

  test("throws a verification error when no chunk can be matched", () => {
    expect(() => applyWorkspacePatchUpdateChunks({
      source: "alpha\nbeta\n",
      filePath: "demo.txt",
      chunks: [{
        oldLines: ["missing"],
        newLines: ["replacement"],
      }],
    })).toThrow("Failed to find expected lines in demo.txt");
  });
});
