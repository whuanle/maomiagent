import { describe, expect, test } from "bun:test";

import {
  buildDiscoverySourceSummaries,
  resolvePreferredDiscoverySource,
  resolveSkillsTabLoadPlan,
} from "./page-state";

describe("skills page state helpers", () => {
  test("preloads managed counts while keeping discovery and market follow-up loads tab-specific", () => {
    expect(resolveSkillsTabLoadPlan("managed")).toEqual({
      managed: true,
      discovery: false,
      marketProviders: false,
    });
    expect(resolveSkillsTabLoadPlan("discovery")).toEqual({
      managed: true,
      discovery: true,
      marketProviders: false,
    });
    expect(resolveSkillsTabLoadPlan("market")).toEqual({
      managed: true,
      discovery: false,
      marketProviders: true,
    });
  });

  test("keeps existing discovery directories visible even when the current query matches no skills", () => {
    const summaries = buildDiscoverySourceSummaries(
      [{
        source: "community",
        label: "Community",
        strategy: "direct",
        candidatePaths: ["C:/Users/ASUS/.agents/skills"],
        existingPaths: ["C:/Users/ASUS/.agents/skills"],
        itemsCount: 0,
      }],
      [],
    );

    expect(summaries).toEqual([{
      source: "community",
      label: "Community",
      strategy: "direct",
      candidatePaths: ["C:/Users/ASUS/.agents/skills"],
      existingPaths: ["C:/Users/ASUS/.agents/skills"],
      count: 0,
      managedCount: 0,
    }]);
  });

  test("prefers the first non-empty discovery source for the default selection", () => {
    const selectedSource = resolvePreferredDiscoverySource(
      [
        {
          source: "antigravity",
          label: "Antigravity",
          strategy: "direct",
          candidatePaths: [],
          existingPaths: ["C:/Users/ASUS/.agent/skills"],
          count: 0,
          managedCount: 0,
        },
        {
          source: "community",
          label: "Community",
          strategy: "direct",
          candidatePaths: [],
          existingPaths: ["C:/Users/ASUS/.agents/skills"],
          count: 3,
          managedCount: 1,
        },
      ],
      "",
    );

    expect(selectedSource).toBe("community");
  });
});
