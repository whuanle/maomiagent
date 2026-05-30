import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "bun:test";

const packageJsonPath = path.resolve(import.meta.dir, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  repository?: { type?: string; url?: string };
  homepage?: string;
  bugs?: { url?: string };
};

describe("maomiagent package manifest", () => {
  test("declares repository metadata that matches GitHub provenance", () => {
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "https://github.com/whuanle/maomiagent",
    });
    expect(packageJson.homepage).toBe("https://github.com/whuanle/maomiagent");
    expect(packageJson.bugs).toEqual({
      url: "https://github.com/whuanle/maomiagent/issues",
    });
  });
});
