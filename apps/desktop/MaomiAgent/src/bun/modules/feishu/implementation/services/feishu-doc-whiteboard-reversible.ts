import { createHash } from "node:crypto";

import type {
  FeishuDocIR,
  FeishuDocIRAsset,
  FeishuDocIRBlock,
  FeishuDocIRReversibleAsset,
} from "../../../../../shared/desktop-feishu-doc-ir";

const REVERSIBLE_MERMAID_COUNT_CHANGED_MESSAGE = "当前文档的 Mermaid 白板数量已变化，暂不支持安全回写。已保留本地草稿。";
const REVERSIBLE_MERMAID_ORDER_CHANGED_MESSAGE = "当前文档的 Mermaid 白板顺序已变化，暂不支持安全回写。已保留本地草稿。";

type RecoveredMermaidWhiteboard = {
  whiteboardToken: string;
  format: "mermaid";
  source: string;
  origin: FeishuDocIRReversibleAsset["origin"];
  resolvedAt: string;
};

type MermaidFence = {
  start: number;
  end: number;
  source: string;
};

type ReversibleMermaidPushPlanNone = { kind: "none" };
type ReversibleMermaidPushPlanBlocked = { kind: "blocked"; message: string };
type ReversibleMermaidPushPlanUpdate = {
  kind: "update";
  documentMarkdown: string;
  changedWhiteboards: Array<{
    whiteboardToken: string;
    source: string;
    sourceChecksum: string;
    ordinal: number;
  }>;
};

export function computeReversibleSourceChecksum(source: string): string {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

export function applyRecoveredMermaidWhiteboards(input: {
  ir: FeishuDocIR;
  recovered: RecoveredMermaidWhiteboard[];
}): FeishuDocIR {
  const ordinalByToken = getWhiteboardOrdinalByToken(input.ir);
  const nextAssets = { ...input.ir.assets };

  for (const entry of input.recovered) {
    const asset = nextAssets[entry.whiteboardToken];
    const ordinal = ordinalByToken.get(entry.whiteboardToken);
    if (!asset || ordinal === undefined) {
      continue;
    }

    nextAssets[entry.whiteboardToken] = {
      ...asset,
      reversible: {
        format: entry.format,
        source: entry.source,
        sourceChecksum: computeReversibleSourceChecksum(entry.source),
        ordinal,
        origin: entry.origin,
        state: "mermaid",
        lastResolvedAt: entry.resolvedAt,
      },
    };
  }

  return {
    ...input.ir,
    assets: nextAssets,
  };
}

export function isReversibleMermaidAsset(
  asset: FeishuDocIRAsset | undefined,
): asset is FeishuDocIRAsset & { reversible: FeishuDocIRReversibleAsset } {
  return asset?.reversible?.format === "mermaid"
    && asset.reversible.state === "mermaid";
}

export function parseMermaidFences(markdown: string): MermaidFence[] {
  const fences: MermaidFence[] = [];
  const pattern = /```[ \t]*mermaid[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    fences.push({
      start: match.index,
      end: match.index + match[0].length,
      source: match[1] ?? "",
    });
  }

  return fences;
}

export function buildReversibleMermaidPushPlan(input: {
  draftMarkdown: string;
  baseIr: FeishuDocIR;
}): ReversibleMermaidPushPlanNone | ReversibleMermaidPushPlanBlocked | ReversibleMermaidPushPlanUpdate {
  const assets = Object.values(input.baseIr.assets)
    .filter(isReversibleMermaidAsset)
    .sort((left, right) => left.reversible.ordinal - right.reversible.ordinal);

  if (assets.length === 0) {
    return { kind: "none" };
  }

  const fences = parseMermaidFences(input.draftMarkdown);
  if (fences.length !== assets.length) {
    return {
      kind: "blocked",
      message: REVERSIBLE_MERMAID_COUNT_CHANGED_MESSAGE,
    };
  }

  const originalOrdinalsByChecksum = new Map<string, number[]>();
  for (const asset of assets) {
    const current = originalOrdinalsByChecksum.get(asset.reversible.sourceChecksum);
    if (current) {
      current.push(asset.reversible.ordinal);
      continue;
    }
    originalOrdinalsByChecksum.set(asset.reversible.sourceChecksum, [asset.reversible.ordinal]);
  }

  for (let index = 0; index < fences.length; index += 1) {
    const fence = fences[index];
    if (!fence) {
      continue;
    }

    const originalMatches = originalOrdinalsByChecksum.get(computeReversibleSourceChecksum(fence.source));
    const originalOrdinal = originalMatches?.shift();
    if (originalOrdinal !== undefined && originalOrdinal !== index) {
      return {
        kind: "blocked",
        message: REVERSIBLE_MERMAID_ORDER_CHANGED_MESSAGE,
      };
    }
  }

  let documentMarkdown = input.draftMarkdown;
  const changedWhiteboards: ReversibleMermaidPushPlanUpdate["changedWhiteboards"] = [];

  for (let index = fences.length - 1; index >= 0; index -= 1) {
    const fence = fences[index];
    const asset = assets[index];
    if (!fence || !asset || asset.reversible.ordinal !== index) {
      return {
        kind: "blocked",
        message: REVERSIBLE_MERMAID_ORDER_CHANGED_MESSAGE,
      };
    }

    documentMarkdown = `${documentMarkdown.slice(0, fence.start)}<whiteboard token="${asset.token}" />${documentMarkdown.slice(fence.end)}`;

    const sourceChecksum = computeReversibleSourceChecksum(fence.source);
    if (sourceChecksum !== asset.reversible.sourceChecksum) {
      changedWhiteboards.unshift({
        whiteboardToken: asset.token,
        source: fence.source,
        sourceChecksum,
        ordinal: index,
      });
    }
  }

  return {
    kind: "update",
    documentMarkdown,
    changedWhiteboards,
  };
}

export function applyReversibleMermaidPushResult(input: {
  ir: FeishuDocIR;
  changedWhiteboards: Array<{
    whiteboardToken: string;
    source: string;
    sourceChecksum: string;
  }>;
  pushedAt: string;
}): FeishuDocIR {
  if (input.changedWhiteboards.length === 0) {
    return input.ir;
  }

  const changedByToken = new Map(input.changedWhiteboards.map((entry) => [entry.whiteboardToken, entry]));
  const nextAssets = Object.fromEntries(
    Object.entries(input.ir.assets).map(([token, asset]) => {
      const changed = changedByToken.get(token);
      if (!changed || !isReversibleMermaidAsset(asset)) {
        return [token, asset];
      }

      return [token, {
        ...asset,
        reversible: {
          ...asset.reversible,
          source: changed.source,
          sourceChecksum: changed.sourceChecksum,
          state: "mermaid" as const,
          lastResolvedAt: input.pushedAt,
          lastError: undefined,
        },
      }];
    }),
  ) as FeishuDocIR["assets"];

  return {
    ...input.ir,
    assets: nextAssets,
  };
}

function getWhiteboardOrdinalByToken(ir: FeishuDocIR): Map<string, number> {
  const ordinals = new Map<string, number>();
  const visited = new Set<string>();
  let ordinal = 0;

  walkBlocks(ir, ir.document.rootBlockId, visited, (block) => {
    if (!isWhiteboardLike(block) || !block.resource?.token || ordinals.has(block.resource.token)) {
      return;
    }

    ordinals.set(block.resource.token, ordinal);
    ordinal += 1;
  });

  return ordinals;
}

function walkBlocks(
  ir: FeishuDocIR,
  blockId: string,
  visited: Set<string>,
  visit: (block: FeishuDocIRBlock) => void,
): void {
  if (visited.has(blockId)) {
    return;
  }
  visited.add(blockId);

  const block = ir.blocks[blockId];
  if (!block) {
    return;
  }

  visit(block);
  for (const childId of block.children) {
    walkBlocks(ir, childId, visited, visit);
  }
}

function isWhiteboardLike(block: FeishuDocIRBlock): boolean {
  return block.type === "whiteboard" || block.type === "board" || block.type === "diagram";
}

export const REVERSIBLE_MERMAID_BLOCK_MESSAGES = {
  countChanged: REVERSIBLE_MERMAID_COUNT_CHANGED_MESSAGE,
  orderChanged: REVERSIBLE_MERMAID_ORDER_CHANGED_MESSAGE,
} as const;
