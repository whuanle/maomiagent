import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createServiceCollection,
} from "../../../shared/ioc";
import type {
  DesktopRuntimeContext,
} from "../../foundation";
import {
  DESKTOP_RUNTIME_CONTEXT,
} from "../../foundation";
import {
  DesktopFeishuModule,
  DESKTOP_FEISHU_COMMAND_PORT,
  DESKTOP_FEISHU_STORE_PORT,
} from "../index";
import type {
  SingleInstanceHttpRoute,
} from "../../../single-instance";
import {
  DESKTOP_FEISHU_OAUTH_CALLBACK_PATH,
} from "../../../../shared/desktop-feishu-oauth";

function createRuntimeContext(
  tempRoot: string,
  routes: SingleInstanceHttpRoute[],
): DesktopRuntimeContext {
  return {
    appIdentifier: "com.maomiagent.desktop.test",
    appName: "MaomiAgent Test",
    channel: "test",
    mainViewUrl: "views://mainview/index.html",
    singleInstance: {
      kind: "primary",
      setActivationHandler() {},
      registerHttpRoute(route) {
        routes.push(route);
        return () => {
          const index = routes.indexOf(route);
          if (index >= 0) {
            routes.splice(index, 1);
          }
        };
      },
      async dispose() {},
    },
    logger: {
      log() {},
      warn() {},
      error() {},
    },
    window: {
      title: "MaomiAgent Test",
      frame: {
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      },
    },
    configuration: {
      values: {
        database: {
          connections: {
            runtimeLogs: {
              path: join(tempRoot, "logs.sqlite"),
            },
            workspace: {
              path: join(tempRoot, "workspace.sqlite"),
            },
            conversation: {
              path: join(tempRoot, "conversation.sqlite"),
            },
          },
        },
        desktop: {
          feishu: {
            store: {
              path: join(tempRoot, "feishu-store.json"),
            },
          },
        },
      },
    },
    createWindow() {
      throw new Error("not needed");
    },
    installProcessHandlers: false,
  };
}

describe("DesktopFeishuModule", () => {
  test("registers the fixed OAuth callback route and delegates to the command port", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-feishu-module-"));
    const routes: SingleInstanceHttpRoute[] = [];
    const originalFetch = globalThis.fetch;

    const services = createServiceCollection();
    services.addSingleton(DESKTOP_RUNTIME_CONTEXT, {
      useValue: createRuntimeContext(tempRoot, routes),
      source: "desktop.feishu.module.test",
    });
    services.addModule(DesktopFeishuModule);

    const host = services.buildModuleHost();

    try {
      await host.start();

      const commandPort = host.container.resolve(DESKTOP_FEISHU_COMMAND_PORT);
      await commandPort.saveDeveloperConfig({
        appId: "cli_test_app",
        appSecret: "secret-1",
      });
      const begin = await commandPort.beginDeveloperAuthorization({
        appId: "cli_test_app",
      });
      const pendingState = new URL(begin.authUrl).searchParams.get("state") ?? "";

      globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
        return new Response(JSON.stringify({
          code: 0,
          access_token: "access-token-1",
          expires_in: 7200,
          refresh_token: "refresh-token-1",
          refresh_token_expires_in: 604800,
          token_type: "Bearer",
          scope: "search:message offline_access",
        }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        });
      }) as unknown as typeof fetch;

      const route = routes.find((item) => (
        item.method === "GET"
        && item.path === DESKTOP_FEISHU_OAUTH_CALLBACK_PATH
      ));

      expect(route).toBeDefined();

      const response = await route!.handler({
        method: "GET",
        url: new URL(
          `http://127.0.0.1:35000${DESKTOP_FEISHU_OAUTH_CALLBACK_PATH}?code=oauth-code-1&state=${pendingState}`,
        ),
        headers: {},
        bodyText: "",
      });

      expect(response.status).toBe(200);
      expect(response.headers?.["content-type"]).toContain("text/html");
      expect(response.body).toContain("授权成功");

      const snapshot = await host.container.resolve(DESKTOP_FEISHU_STORE_PORT).read();
      expect(snapshot.state.smartAssistant.authStatus).toBe("authorized");
      expect(snapshot.auth.smartAssistant.refreshToken).toBe("refresh-token-1");
    } finally {
      globalThis.fetch = originalFetch;
      await host.dispose().catch(() => undefined);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
