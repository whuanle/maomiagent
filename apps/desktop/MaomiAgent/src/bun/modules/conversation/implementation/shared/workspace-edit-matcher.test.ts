import { describe, expect, test } from "bun:test";

import {
  resolveWorkspaceEditMatch,
  WorkspaceEditMatchError,
} from "./workspace-edit-matcher";

describe("resolveWorkspaceEditMatch", () => {
  test("finds an exact unique fragment", () => {
    expect(resolveWorkspaceEditMatch({
      content: "alpha\nbeta\ngamma\n",
      oldText: "beta",
    })).toEqual({
      resolvedFragment: "beta",
      strategy: "exact",
      matchCount: 1,
    });
  });

  test("recovers a block when only indentation drifted", () => {
    expect(resolveWorkspaceEditMatch({
      content: "if (ready) {\n    run();\n}\n",
      oldText: "if (ready) {\n  run();\n}",
    })).toEqual(expect.objectContaining({
      strategy: "indentation_flexible",
      resolvedFragment: "if (ready) {\n    run();\n}",
    }));
  });

  test("recovers a multiline block with context-aware matching", () => {
    expect(resolveWorkspaceEditMatch({
      content: ["## first", "a", "b", "tail", "## second", "a", "x", "tail"].join("\n"),
      oldText: ["## second", "a", "b", "tail"].join("\n"),
    })).toEqual(expect.objectContaining({
      strategy: "context_aware",
      resolvedFragment: ["## second", "a", "x", "tail"].join("\n"),
    }));
  });

  test("reports ambiguity when multiple exact candidates remain", () => {
    expect(() => resolveWorkspaceEditMatch({
      content: "token\ntoken\n",
      oldText: "token",
    })).toThrow("Found multiple matches");
  });

  test("surfaces structured failure metadata", () => {
    try {
      resolveWorkspaceEditMatch({
        content: "alpha\nbeta\n",
        oldText: "missing",
      });
      throw new Error("expected structured match failure");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceEditMatchError);
      expect(error).toEqual(expect.objectContaining({
        code: "not_found",
        attemptedStrategies: expect.arrayContaining(["exact", "context_aware"]),
      }));
    }
  });
});
