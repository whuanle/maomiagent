import type {
  DesktopDiscoveredSkillItem,
  DesktopSkillsDiscoverySourceStatus,
} from "../../../../shared/desktop-skills";

export type SourceSummary = {
  source: string;
  label: string;
  strategy: string;
  candidatePaths: string[];
  existingPaths: string[];
  count: number;
  managedCount: number;
};

export function buildDiscoverySourceSummaries(
  discoverySources: DesktopSkillsDiscoverySourceStatus[],
  discoveryItems: DesktopDiscoveredSkillItem[],
): SourceSummary[] {
  const summaryMap = new Map<string, SourceSummary>();

  for (const source of discoverySources) {
    summaryMap.set(source.source, {
      source: source.source,
      label: source.label,
      strategy: source.strategy,
      candidatePaths: source.candidatePaths,
      existingPaths: source.existingPaths,
      count: source.itemsCount,
      managedCount: 0,
    });
  }

  for (const item of discoveryItems) {
    const current = summaryMap.get(item.source);

    if (current) {
      if (item.managed) {
        current.managedCount += 1;
      }
      summaryMap.set(item.source, current);
      continue;
    }

    summaryMap.set(item.source, {
      source: item.source,
      label: item.source,
      strategy: "",
      candidatePaths: [],
      existingPaths: [],
      count: 1,
      managedCount: item.managed ? 1 : 0,
    });
  }

  return [...summaryMap.values()]
    .filter((item) => item.count > 0 || item.existingPaths.length > 0)
    .sort((left, right) => left.label.localeCompare(right.label, "en", { sensitivity: "base" }));
}

export function resolveSkillsTabLoadPlan(activeTab: "managed" | "discovery" | "market") {
  return {
    managed: true,
    discovery: activeTab === "discovery",
    marketProviders: activeTab === "market",
  };
}

export function resolvePreferredDiscoverySource(
  sourceSummaries: SourceSummary[],
  selectedSource: string,
) {
  if (sourceSummaries.length === 0) {
    return "";
  }

  if (selectedSource && sourceSummaries.some((item) => item.source === selectedSource)) {
    return selectedSource;
  }

  return sourceSummaries.find((item) => item.count > 0)?.source
    ?? sourceSummaries[0]?.source
    ?? "";
}
