import type { DesktopRuntimeContext } from "../../../foundation";
import type { RuntimeLogger } from "../../../logs/abstraction/models/runtime-log.models";
import type { DesktopTracePort } from "../../../observability/abstraction/ports/desktop-tracing.port";
import type { DesktopMainWindowServicePort } from "../../abstraction/ports/desktop-main-window-service.port";
import type { DesktopBrowserWindow } from "../../abstraction/models/desktop-window";

export class DesktopMainWindowService implements DesktopMainWindowServicePort {
  private window: DesktopBrowserWindow | null = null;

  constructor(
    private readonly runtimeContext: DesktopRuntimeContext,
    private readonly trace: string[],
    private readonly logger: RuntimeLogger,
    private readonly tracer: DesktopTracePort,
  ) {}

  ensureMainWindow(): DesktopBrowserWindow {
    if (this.window) {
      return this.window;
    }

    const span = this.tracer.startSpan({
      name: "desktop.window.create",
      attributes: {
        "desktop.window.title": this.runtimeContext.window.title,
        "desktop.channel": this.runtimeContext.channel,
      },
    });

    try {
      const createdWindow = this.runtimeContext.createWindow({
        title: this.runtimeContext.window.title,
        url: this.runtimeContext.mainViewUrl,
        frame: { ...this.runtimeContext.window.frame },
      });
      createdWindow.on("close", () => {
        this.window = null;
        this.trace.push("window:closed");
        void this.logger.info("Desktop main window closed");
      });
      this.window = createdWindow;
      this.trace.push("window:created");
      void this.logger.info("Desktop main window created", {
        traceId: span.traceId,
        context: {
          title: this.runtimeContext.window.title,
          mainViewUrl: this.runtimeContext.mainViewUrl,
        },
      });
      span.setStatus("ok");
      return createdWindow;
    } catch (error) {
      span.recordException(error);
      span.setStatus("error", error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      span.end();
    }

  }

  activateMainWindow(): void {
    const span = this.tracer.startSpan({
      name: "desktop.window.activate",
      attributes: {
        "desktop.channel": this.runtimeContext.channel,
      },
    });

    try {
      const window = this.ensureMainWindow();
      window.show();
      if (window.isMinimized()) {
        window.unminimize();
      }
      window.focus();
      this.trace.push("window:activated");
      void this.logger.info("Desktop main window activated", {
        traceId: span.traceId,
      });
      span.setStatus("ok");
    } catch (error) {
      span.recordException(error);
      span.setStatus("error", error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      span.end();
    }
  }

  getMainWindow(): DesktopBrowserWindow | null {
    return this.window;
  }
}