import { afterEach, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { captureDesktopScreenshotForWechat } from "./wechat-desktop-capture";

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

test("captureDesktopScreenshotForWechat validates the generated image file", async () => {
  const outputDir = join(tmpdir(), `maomi-wechat-capture-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  createdDirs.push(outputDir);

  const result = await captureDesktopScreenshotForWechat({
    outputDir,
    runCapture: async (outputPath) => {
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(outputPath, "fake-image");
      return {
        exitCode: 0,
        stdout: "{\"ok\":true}",
        stderr: "",
      };
    },
  });

  expect(result.filePath).toContain(outputDir);
  expect(result.fileName).toMatch(/\.png$/);
});

test("captureDesktopScreenshotForWechat fails when the image file is missing", async () => {
  const outputDir = join(
    tmpdir(),
    `maomi-wechat-capture-missing-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  createdDirs.push(outputDir);

  await expect(captureDesktopScreenshotForWechat({
    outputDir,
    runCapture: async () => ({
      exitCode: 0,
      stdout: "{\"ok\":true}",
      stderr: "",
    }),
  })).rejects.toThrow("桌面截图未生成可发送的图片文件");
});
