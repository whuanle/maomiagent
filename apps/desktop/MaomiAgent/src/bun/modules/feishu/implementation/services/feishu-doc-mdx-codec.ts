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

  if (block.type.startsWith("heading")) {
    const level = headingLevel(block.type);
    return level ? `${"#".repeat(level)} ${text}` : unsupportedBlock(block);
  }

  switch (block.type) {
    case "text":
      return text;
    case "bullet":
      return `- ${text}`;
    case "ordered":
      return `1. ${text}`;
    case "quote":
      return `> ${text}`;
    case "code":
      return `\`\`\`\n${text}\n\`\`\``;
    case "todo":
      return `- [ ] ${text}`;
    case "image":
      return selfClosingComponent("FeishuImage", componentAttrs({
        token: block.resource?.token,
        width: block.attrs.width,
        height: block.attrs.height,
      }));
    case "file":
      return selfClosingComponent("FeishuFile", componentAttrs({
        token: block.resource?.token,
        name: block.attrs.name,
      }));
    case "callout":
      return flowComponent("FeishuCallout", componentAttrs({ blockId: block.id }), children || text);
    case "grid":
      return flowComponent("FeishuGrid", componentAttrs({ blockId: block.id }), children);
    case "grid-column":
      return flowComponent("FeishuGridColumn", componentAttrs({ blockId: block.id }), children);
    default:
      return unsupportedBlock(block);
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

function headingLevel(type: string): number | null {
  const match = /^heading([1-6])$/.exec(type);
  return match ? Number(match[1]) : null;
}

function unsupportedBlock(block: FeishuDocIRBlock): string {
  return selfClosingComponent("FeishuUnsupportedBlock", componentAttrs({ blockId: block.id, type: block.type }));
}

function flowComponent(name: string, attrs: string, children: string): string {
  return `<${name}${attrs}>\n${children}\n</${name}>`;
}

function selfClosingComponent(name: string, attrs: string): string {
  return `<${name}${attrs} />`;
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