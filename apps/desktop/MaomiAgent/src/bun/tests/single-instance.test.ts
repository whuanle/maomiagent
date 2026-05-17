import { describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import { createSingleInstanceCoordinator } from "../single-instance";

const TEST_PORT_BASE = 35100;
let nextTestPort = TEST_PORT_BASE;

function allocateTestPort() {
  nextTestPort += 1;
  return nextTestPort;
}

describe("createSingleInstanceCoordinator", () => {
  test("activates the existing primary instance instead of launching a duplicate", async () => {
    const appKey = `com.maomiagent.desktop.test.${randomUUID()}`;
    const port = allocateTestPort();
    const primary = await createSingleInstanceCoordinator({
      appKey,
      appName: "MaomiAgent Test",
      port,
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
        port,
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

  test("dispatches registered callback routes on the primary control plane", async () => {
    const appKey = `com.maomiagent.desktop.test.${randomUUID()}`;
    const port = allocateTestPort();
    const primary = await createSingleInstanceCoordinator({
      appKey,
      appName: "MaomiAgent Test",
      port,
    });

    try {
      const unregister = primary.registerHttpRoute({
        method: "GET",
        path: "/desktop/feishu/oauth/callback",
        async handler(request) {
          return {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=utf-8",
            },
            body: request.url.searchParams.get("state") ?? "missing",
          };
        },
      });

      try {
        const response = await fetch(
          `http://127.0.0.1:${port}/desktop/feishu/oauth/callback?state=oauth-state-1`,
        );
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("oauth-state-1");
      } finally {
        unregister();
      }
    } finally {
      await primary.dispose();
    }
  });

  test("fails clearly when the requested port belongs to another process", async () => {
    const port = allocateTestPort();
    const foreignServer = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ accepted: false, protocol: "foreign.listener.v1" }));
    });

    await new Promise<void>((resolve) => foreignServer.listen(port, "127.0.0.1", resolve));

    try {
      await expect(
        createSingleInstanceCoordinator({
          appKey: `com.maomiagent.desktop.test.${randomUUID()}`,
          appName: "MaomiAgent Test",
          port,
        }),
      ).rejects.toThrow(
        `MaomiAgent Test could not establish a single-instance activation channel on 127.0.0.1:${port}.`,
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        foreignServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });
});
