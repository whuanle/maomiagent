import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("stage dialog keeps the title-bar-safe schema-driven contract", () => {
  const dialogSource = readFileSync(new URL("./stage-dialog.tsx", import.meta.url), "utf8");
  const formSource = readFileSync(new URL("./stage-form-renderer.tsx", import.meta.url), "utf8");

  expect(dialogSource).toContain("maxHeight: \"80vh\"");
  expect(dialogSource).toContain("overflow: \"auto\"");
  expect(dialogSource).toContain("StageFormRenderer");
  expect(dialogSource).toContain("setValues(initialValues)");
  expect(dialogSource).toContain("props.onSubmit(values)");
  expect(formSource).toContain('kind: "singleSelect"');
  expect(formSource).toContain('kind: "multiSelect"');
  expect(formSource).toContain('kind: "boolean"');
  expect(formSource).toContain("<Select");
  expect(formSource).toContain("<Switch");
});
