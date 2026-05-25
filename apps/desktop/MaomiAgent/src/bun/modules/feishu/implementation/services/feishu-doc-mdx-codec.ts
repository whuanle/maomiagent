import { pathToFileURL } from "node:url";

import type { FeishuDocIR, FeishuDocIRBlock } from "../../../../../shared/desktop-feishu-doc-ir";

export type FeishuDocMdxPatch = {
  blockUpdates: Array<{ blockId: string; text: string }>;
};

export function feishuDocIRToMdx(ir: FeishuDocIR): string {
  const root = ir.blocks[ir.document.rootBlockId];
  const lines = (root?.children ?? [])
    .map((id) => blockToMdx(ir, id))
    .filter((line) => line.length > 0);
  return `${lines.join("\n\n")}\n`;
}

export function feishuDocMdxToIRPatch(base: FeishuDocIR, mdx: string): FeishuDocMdxPatch {
  const heading = /^#\s+(.+)$/m.exec(mdx);
  const firstHeading = firstBlockByType(base, "heading1");
  return heading && firstHeading
    ? { blockUpdates: [{ blockId: firstHeading.id, text: heading[1].trim() }] }
    : { blockUpdates: [] };
}

function firstBlockByType(ir: FeishuDocIR, type: FeishuDocIRBlock["type"]): FeishuDocIRBlock | null {
  const root = ir.blocks[ir.document.rootBlockId];
  const queue = [...(root?.children ?? [])];
  while (queue.length > 0) {
    const block = ir.blocks[queue.shift() ?? ""];
    if (!block) {
      continue;
    }
    if (block.type === type) {
      return block;
    }
    queue.push(...block.children);
  }
  return null;
}

function blockToMdx(ir: FeishuDocIR, blockId: string): string {
  const block = ir.blocks[blockId];
  if (!block) {
    return "";
  }

  const text = blockText(block);
  const children = childBlocksToMdx(ir, block);
  const body = blockBody(text, children);
  const hasVisibleText = text.trim().length > 0;

  if (block.type.startsWith("heading")) {
    const level = headingLevel(block.type);
    return level ? (hasVisibleText ? `${"#".repeat(level)} ${text}` : "") : nativeBlockComponent(ir, block, body);
  }

  switch (block.type) {
    case "text":
      return hasVisibleText ? text : "";
    case "bullet":
      return hasVisibleText ? `- ${text}` : "";
    case "ordered":
      return hasVisibleText ? `1. ${text}` : "";
    case "quote":
      return hasVisibleText ? `> ${text}` : "";
    case "code":
      return hasVisibleText ? `\`\`\`\n${text}\n\`\`\`` : "";
    case "todo":
      return hasVisibleText ? `- [ ] ${text}` : "";
    case "image":
      return selfClosingComponent("FeishuImage", componentAttrs(componentPropsFromBlock(ir, block)));
    case "file":
      return selfClosingComponent("FeishuFile", componentAttrs(componentPropsFromBlock(ir, block)));
    case "callout":
      return nativeComponent("FeishuCallout", componentAttrs(componentPropsFromBlock(ir, block, { includeBlockId: true })), body);
    case "grid":
      return nativeComponent("FeishuGrid", componentAttrs(componentPropsFromBlock(ir, block, { includeBlockId: true })), body);
    case "grid-column":
      return nativeComponent("FeishuGridColumn", componentAttrs(componentPropsFromBlock(ir, block, { includeBlockId: true })), body);
    default:
      return nativeBlockComponent(ir, block, body);
  }
}

function childBlocksToMdx(ir: FeishuDocIR, block: FeishuDocIRBlock): string {
  return block.children
    .map((id) => blockToMdx(ir, id))
    .filter((line) => line.length > 0)
    .join("\n\n");
}

function blockText(block: FeishuDocIRBlock): string {
  return block.text.map((run) => run.text).join("");
}

function blockBody(text: string, children: string): string {
  return [text, children]
    .filter((value) => value.trim().length > 0)
    .join("\n\n");
}

function headingLevel(type: string): number | null {
  const match = /^heading([1-6])$/.exec(type);
  return match ? Number(match[1]) : null;
}

function nativeBlockComponent(ir: FeishuDocIR, block: FeishuDocIRBlock, body: string): string {
  return nativeComponent(
    componentNameForBlockType(block.type),
    componentAttrs(componentPropsFromBlock(ir, block, { includeBlockId: true })),
    body,
  );
}

function flowComponent(name: string, attrs: string, children: string): string {
  return `<${name}${attrs}>\n${children}\n</${name}>`;
}

function selfClosingComponent(name: string, attrs: string): string {
  return `<${name}${attrs} />`;
}

function nativeComponent(name: string, attrs: string, body: string): string {
  return body ? flowComponent(name, attrs, body) : selfClosingComponent(name, attrs);
}

function componentNameForBlockType(type: FeishuDocIRBlock["type"]): string {
  return `Feishu${type
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}`;
}

function componentPropsFromBlock(
  ir: FeishuDocIR,
  block: FeishuDocIRBlock,
  options: { includeBlockId?: boolean } = {},
): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {};

  if (options.includeBlockId) {
    attrs.blockId = block.id;
  }

  if (block.resource?.token) {
    attrs.token = block.resource.token;

    const asset = ir.assets[block.resource.token];
    if (block.type === "image" && asset?.status === "cached" && asset.absolutePath?.trim()) {
      attrs.src = pathToFileURL(asset.absolutePath).toString();
    }
  }

  for (const [key, value] of Object.entries(block.attrs)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      attrs[key] = value;
    }
  }

  return attrs;
}

function componentAttrs(values: Record<string, unknown>): string {
  const attrs = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ` ${key}="${escapeAttribute(String(value))}"`);
  return attrs.join("");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}