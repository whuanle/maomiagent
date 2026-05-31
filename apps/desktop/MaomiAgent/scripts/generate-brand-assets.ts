import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceSvgPath = resolve(
  projectRoot,
  "src/mainview/public/branding/maomi-mark.svg",
);

const outputs = [
  {
    size: 192,
    filePath: resolve(
      projectRoot,
      "src/mainview/public/branding/generated/icon-192.png",
    ),
  },
  {
    size: 512,
    filePath: resolve(
      projectRoot,
      "src/mainview/public/branding/generated/icon-512.png",
    ),
  },
];
const windowsIconOutputs = [
  resolve(projectRoot, "src/mainview/public/branding/generated/icon-512.ico"),
  resolve(projectRoot, "src/mainview/public/branding/generated/icon.ico"),
];

const svgSource = await Bun.file(sourceSvgPath).text();

for (const output of outputs) {
  const renderer = new Resvg(svgSource, {
    fitTo: {
      mode: "width",
      value: output.size,
    },
    background: "rgba(0,0,0,0)",
  });

  const pngData = renderer.render().asPng();
  await mkdir(dirname(output.filePath), { recursive: true });
  await Bun.write(output.filePath, new Uint8Array(pngData));
  console.log(`Generated brand asset: ${output.filePath}`);
}

const windowsPngSourcePath =
  outputs.find((output) => output.size === 512)?.filePath ?? outputs[outputs.length - 1]?.filePath;

if (windowsPngSourcePath) {
  const iconGenerator = Bun.spawn({
    cmd: ["bun", "x", "png-to-ico", windowsPngSourcePath],
    cwd: projectRoot,
    stdout: "pipe",
    stderr: "inherit",
  });
  const iconBuffer = await new Response(iconGenerator.stdout).arrayBuffer();
  const exitCode = await iconGenerator.exited;

  if (exitCode !== 0) {
    throw new Error(`png-to-ico failed with exit code ${exitCode}`);
  }

  const iconData = new Uint8Array(iconBuffer);
  for (const iconPath of windowsIconOutputs) {
    await mkdir(dirname(iconPath), { recursive: true });
    await Bun.write(iconPath, iconData);
    console.log(`Generated brand asset: ${iconPath}`);
  }
}
