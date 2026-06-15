import { describe, expect, test } from "bun:test";

import type { DesktopRuntimeContext } from "../../../foundation";
import type { RuntimeLogger } from "../../../logs/abstraction/models/runtime-log.models";
import type { DesktopTracePort } from "../../../observability/abstraction/ports/desktop-tracing.port";
import { DesktopMainWindowService } from "./desktop-main-window-service";

function createLoggerStub(): RuntimeLogger {
  return {
    write: async () => ({ id: "1", at: "", level: "info", source: "desktop", module: "desktop.window", message: "" }),
    debug: async () => ({ id: "1", at: "", level: "debug", source: "desktop", module: "desktop.window", message: "" }),
    info: async () => ({ id: "1", at: "", level: "info", source: "desktop", module: "desktop.window", message: "" }),
    warn: async () => ({ id: "1", at: "", level: "warn", source: "desktop", module: "desktop.window", message: "" }),
    error: async () => ({ id: "1", at: "", level: "error", source: "desktop", module: "desktop.window", message: "" }),
  };
}

function createTraceStub(): DesktopTracePort {
  return {
    startSpan() {
      return {
        traceId: "trace-1",
        spanId: "span-1",
        setAttribute() {},
        setAttributes() {},
        recordException() {},
        setStatus() {},
        end() {},
      };
    },
    async trace(input, callback) {
      return callback(this.startSpan(input));
    },
  };
}

describe("DesktopMainWindowService", () => {
  test("centers an off-screen restored window on the current display before focusing it", () => {
    const previousScreen = globalThis.Screen;
    const previousDisableWindowsScreenQuery = process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY;
    const metrics = {
      focusCalls: 0,
      showCalls: 0,
      unminimizeCalls: 0,
      setFrameCalls: 0,
    };
    let minimized = true;
    let frame = {
      x: -1400,
      y: 80,
      width: 1240,
      height: 840,
    };

    Object.assign(globalThis, {
      Screen: {
        getAllDisplays() {
          return [{
            workArea: { x: 0, y: 0, width: 1920, height: 1080 },
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          }];
        },
        getPrimaryDisplay() {
          return {
            workArea: { x: 0, y: 0, width: 1920, height: 1080 },
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          };
        },
      },
    });
    process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY = "1";

    const runtimeContext: DesktopRuntimeContext = {
      appIdentifier: "com.maomiagent.desktop",
      appName: "MaomiAgent",
      channel: "dev",
      mainViewUrl: "views://mainview/index.html",
      singleInstance: {
        kind: "primary",
        setActivationHandler() {},
        registerHttpRoute() {
          return () => {};
        },
        async dispose() {},
      },
      logger: console,
      window: {
        title: "MaomiAgent",
        frame: {
          x: 160,
          y: 80,
          width: 1240,
          height: 840,
        },
      },
      createWindow() {
        return {
          focus() {
            metrics.focusCalls += 1;
          },
          getFrame() {
            return { ...frame };
          },
          isFullScreen() {
            return false;
          },
          isMaximized() {
            return false;
          },
          isMinimized() {
            return minimized;
          },
          on() {},
          setFrame(x, y, width, height) {
            frame = { x, y, width, height };
            metrics.setFrameCalls += 1;
          },
          show() {
            metrics.showCalls += 1;
          },
          unminimize() {
            minimized = false;
            metrics.unminimizeCalls += 1;
          },
          unmaximize() {},
        };
      },
      installProcessHandlers: false,
    };

    try {
      const service = new DesktopMainWindowService(
        runtimeContext,
        [],
        createLoggerStub(),
        createTraceStub(),
      );

      service.activateMainWindow();

      expect(metrics.showCalls).toBe(1);
      expect(metrics.unminimizeCalls).toBe(1);
      expect(metrics.setFrameCalls).toBe(1);
      expect(frame.x).toBe(340);
      expect(frame.y).toBe(120);
      expect(metrics.focusCalls).toBe(1);
    } finally {
      if (previousDisableWindowsScreenQuery === undefined) {
        delete process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY;
      } else {
        process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY = previousDisableWindowsScreenQuery;
      }
      Object.assign(globalThis, {
        Screen: previousScreen,
      });
    }
  });

  test("centers the window on the last display after taskbar activation from minimize", () => {
    const previousScreen = globalThis.Screen;
    const previousDisableWindowsScreenQuery = process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY;
    const handlers = new Map<string, Array<() => void>>();
    let minimized = false;
    let frame = {
      x: 2080,
      y: 120,
      width: 1280,
      height: 860,
    };

    Object.assign(globalThis, {
      Screen: {
        getAllDisplays() {
          return [
            {
              workArea: { x: 0, y: 0, width: 1920, height: 1080 },
              bounds: { x: 0, y: 0, width: 1920, height: 1080 },
            },
            {
              workArea: { x: 1920, y: 0, width: 2560, height: 1440 },
              bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
            },
          ];
        },
        getPrimaryDisplay() {
          return {
            workArea: { x: 0, y: 0, width: 1920, height: 1080 },
            bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          };
        },
      },
    });
    process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY = "1";

    const runtimeContext: DesktopRuntimeContext = {
      appIdentifier: "com.maomiagent.desktop",
      appName: "MaomiAgent",
      channel: "dev",
      mainViewUrl: "views://mainview/index.html",
      singleInstance: {
        kind: "primary",
        setActivationHandler() {},
        registerHttpRoute() {
          return () => {};
        },
        async dispose() {},
      },
      logger: console,
      window: {
        title: "MaomiAgent",
        frame: {
          x: 160,
          y: 80,
          width: 1240,
          height: 840,
        },
      },
      createWindow() {
        return {
          focus() {},
          getFrame() {
            return { ...frame };
          },
          isFullScreen() {
            return false;
          },
          isMaximized() {
            return false;
          },
          isMinimized() {
            return minimized;
          },
          on(name, handler) {
            const key = String(name);
            const existing = handlers.get(key) ?? [];
            existing.push(handler as () => void);
            handlers.set(key, existing);
          },
          setFrame(x, y, width, height) {
            frame = { x, y, width, height };
          },
          show() {},
          unminimize() {
            minimized = false;
          },
          unmaximize() {},
        };
      },
      installProcessHandlers: false,
    };

    try {
      const service = new DesktopMainWindowService(
        runtimeContext,
        [],
        createLoggerStub(),
        createTraceStub(),
      );

      service.ensureMainWindow();
      handlers.get("move")?.forEach((handler) => handler());

      minimized = true;
      frame = {
        x: 1500,
        y: 120,
        width: 1280,
        height: 860,
      };

      service.activateMainWindow();

      expect(frame).toEqual({
        x: 2560,
        y: 290,
        width: 1280,
        height: 860,
      });
    } finally {
      if (previousDisableWindowsScreenQuery === undefined) {
        delete process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY;
      } else {
        process.env.MAOMI_DESKTOP_DISABLE_WINDOWS_SCREEN_QUERY = previousDisableWindowsScreenQuery;
      }
      Object.assign(globalThis, {
        Screen: previousScreen,
      });
    }
  });
});
