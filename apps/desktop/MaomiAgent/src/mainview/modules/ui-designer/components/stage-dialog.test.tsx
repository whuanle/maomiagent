import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("stage dialog keeps local form interactions in a title-bar-safe modal", () => {
  const dialogSource = readFileSync(new URL("./stage-dialog.tsx", import.meta.url), "utf8");
  const formSource = readFileSync(new URL("./stage-form-renderer.tsx", import.meta.url), "utf8");

  expect(dialogSource).toContain("style={{ top: 72 }}");
  expect(dialogSource).toContain("maxHeight: \"80vh\"");
  expect(dialogSource).toContain("overflow: \"auto\"");
  expect(dialogSource).toContain("StageFormRenderer");
  expect(dialogSource).toContain("setValues(initialValues)");
  expect(dialogSource).toContain("normalizeSubmittedFieldValues");
  expect(formSource).toContain("recommendedOptions");
  expect(formSource).toContain('kind === "select"');
  expect(formSource).toContain('kind === "multiselect"');
  expect(formSource).toContain('kind === "boolean"');
  expect(formSource).toContain("<Select");
  expect(formSource).toContain("<Switch");
});
