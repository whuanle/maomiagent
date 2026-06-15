import type { DesktopRuntimeContext } from "../../../foundation";
import type { RuntimeLogger } from "../../../logs/abstraction/models/runtime-log.models";
import type { DesktopTracePort } from "../../../observability/abstraction/ports/desktop-tracing.port";
import type { DesktopMainWindowServicePort } from "../../abstraction/ports/desktop-main-window-service.port";
import type {
  DesktopBrowserWindow,
  DesktopWindowFrame,
} from "../../abstraction/models/desktop-window";
import {
  ensureWindowFrameVisible,
  fitFrameToVisibleWorkArea,
  resolveNearestWorkArea,
} from "./window-frame-visibility";
import { resolveCenteredFrameInWorkArea } from "./window-frame-operations";

export class DesktopMainWindowService implements DesktopMainWindowServicePort {
  private window: DesktopBrowserWindow | null = null;
  private lastNormalWindowFrame: DesktopWindowFrame | null = null;
  private lastNormalWorkArea: DesktopWindowFrame | null = null;

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
      const rememberNormalFrame = () => {
        if (
          createdWindow.isMinimized()
          || createdWindow.isMaximized()
          || createdWindow.isFullScreen()
        ) {
          return;
        }

        this.lastNormalWindowFrame = ensureWindowFrameVisible(createdWindow);
        this.lastNormalWorkArea = resolveNearestWorkArea(this.lastNormalWindowFrame);
      };
      createdWindow.on("close", () => {
        this.window = null;
        this.lastNormalWindowFrame = null;
        this.lastNormalWorkArea = null;
        this.trace.push("window:closed");
        void this.logger.info("Desktop main window closed");
      });
      createdWindow.on("move", rememberNormalFrame);
      createdWindow.on("resize", rememberNormalFrame);
      this.window = createdWindow;
      rememberNormalFrame();
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
      const wasMinimized = window.isMinimized();
      window.show();
      if (wasMinimized) {
        window.unminimize();
      }
      if (!window.isMaximized() && !window.isFullScreen()) {
        if (wasMinimized) {
          const restoreSize = this.lastNormalWindowFrame ?? this.runtimeContext.window.frame;
          const workArea = this.lastNormalWorkArea
            ?? resolveNearestWorkArea(this.lastNormalWindowFrame ?? window.getFrame());
          const fittedFrame = fitFrameToVisibleWorkArea(resolveCenteredFrameInWorkArea({
            workArea,
            frame: {
              width: restoreSize.width,
              height: restoreSize.height,
            },
          }));
          window.setFrame(
            fittedFrame.x,
            fittedFrame.y,
            fittedFrame.width,
            fittedFrame.height,
          );
          this.lastNormalWindowFrame = fittedFrame;
          this.lastNormalWorkArea = resolveNearestWorkArea(fittedFrame);
        } else {
          this.lastNormalWindowFrame = ensureWindowFrameVisible(window);
          this.lastNormalWorkArea = resolveNearestWorkArea(this.lastNormalWindowFrame);
        }
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
