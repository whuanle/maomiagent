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
  test("uses the runtime loopback port override when no explicit port is supplied", async () => {
    const appKey = `com.maomiagent.desktop.test.${randomUUID()}`;
    const port = allocateTestPort();
    const previousPort = process.env.MAOMI_DESKTOP_LOCAL_CONTROL_PORT;
    process.env.MAOMI_DESKTOP_LOCAL_CONTROL_PORT = String(port);

    try {
      const primary = await createSingleInstanceCoordinator({
        appKey,
        appName: "MaomiAgent Test",
      });

      expect(primary.kind).toBe("primary");

      try {
        const secondary = await createSingleInstanceCoordinator({
          appKey,
          appName: "MaomiAgent Test",
        });

        try {
          expect(secondary.kind).toBe("secondary");
        } finally {
          await secondary.dispose();
        }
      } finally {
        await primary.dispose();
      }
    } finally {
      if (previousPort === undefined) {
        delete process.env.MAOMI_DESKTOP_LOCAL_CONTROL_PORT;
      } else {
        process.env.MAOMI_DESKTOP_LOCAL_CONTROL_PORT = previousPort;
      }
    }
  });

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

  test("returns binary bodies from registered callback routes", async () => {
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
        path: "/desktop/feishu/docs/media",
        async handler() {
          return {
            status: 200,
            headers: {
              "content-type": "image/png",
            },
            bodyBytes: new Uint8Array([137, 80, 78, 71]),
          };
        },
      });

      try {
        const response = await fetch(
          `http://127.0.0.1:${port}/desktop/feishu/docs/media?token=file_token_1`,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137, 80, 78, 71]);
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
