export const FEISHU_DOCS_MERMAID_SOURCE_MARKERS = [
  "graph ",
  "flowchart ",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
  "journey",
  "mindmap",
  "timeline",
  "gitGraph",
  "pie ",
  "quadrantChart",
  "requirement",
  "xychart-beta",
  "block-beta",
  "sankey-beta",
  "packet-beta",
  "architecture-beta",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
] as const;

export function looksLikeFeishuDocsMermaidSource(source: string): boolean {
  const normalized = source.trimStart();
  if (!normalized) {
    return false;
  }

  return FEISHU_DOCS_MERMAID_SOURCE_MARKERS.some((marker) => normalized.startsWith(marker));
}

export function shouldRenderFeishuDocsMermaidBlock(input: {
  language?: string;
  source: string;
}): boolean {
  const normalizedLanguage = input.language?.trim().toLowerCase() ?? "";
  return normalizedLanguage === "mermaid" || looksLikeFeishuDocsMermaidSource(input.source);
}
