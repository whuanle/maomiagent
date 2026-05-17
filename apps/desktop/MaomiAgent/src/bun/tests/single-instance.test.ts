import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { createSingleInstanceCoordinator } from "../single-instance";

describe("createSingleInstanceCoordinator", () => {
  test("activates the existing primary instance instead of launching a duplicate", async () => {
    const appKey = `com.maomiagent.desktop.test.${randomUUID()}`;
    const primary = await createSingleInstanceCoordinator({
      appKey,
      appName: "MaomiAgent Test",
    });

    expect(primary.kind).toBe("primary");

    try {
      const activated = new Promise<void>((resolve) => {
        primary.setActivationHandler(() => {
          resolve();
        });
      });

      const secondary = await createSingleInstanceCoordinator({
        appKey,
        appName: "MaomiAgent Test",
      });

      try {
        expect(secondary.kind).toBe("secondary");
        await activated;
      } finally {
        await secondary.dispose();
      }
    } finally {
      await primary.dispose();
    }
  });
});