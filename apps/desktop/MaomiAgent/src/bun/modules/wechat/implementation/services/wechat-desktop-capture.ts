import { promises as fs } from "node:fs";
import { basename, join } from "node:path";

export type WechatDesktopCaptureRunner = (outputPath: string) => Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export type WechatDesktopCaptureResult = {
  filePath: string;
  fileName: string;
};

async function runEasytouchScreenCapture(outputPath: string) {
  const processHandle = Bun.spawn({
    cmd: ["et", "screen", "capture", "--path", outputPath, "--output", "json"],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    processHandle.exited,
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
  ]);

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

export async function captureDesktopScreenshotForWechat(input: {
  outputDir: string;
  fileNamePrefix?: string;
  runCapture?: WechatDesktopCaptureRunner;
}): Promise<WechatDesktopCaptureResult> {
  const fileName = `${input.fileNamePrefix?.trim() || "wechat-desktop-capture"}-${Date.now()}.png`;
  const filePath = join(input.outputDir, fileName);
  const runCapture = input.runCapture ?? runEasytouchScreenCapture;

  await fs.mkdir(input.outputDir, { recursive: true });
  const result = await runCapture(filePath);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `easytouch screenshot failed (exit ${result.exitCode})`);
  }

  const stats = await fs.stat(filePath).catch(() => undefined);
  if (!stats || stats.size <= 0) {
    throw new Error("桌面截图未生成可发送的图片文件");
  }

  return {
    filePath,
    fileName: basename(filePath),
  };
}
