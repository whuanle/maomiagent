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