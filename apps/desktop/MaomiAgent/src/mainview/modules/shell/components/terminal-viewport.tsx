import { useEffect, useRef } from "react";
import type { FitAddon as GhosttyFitAddon, Terminal as GhosttyTerminal } from "ghostty-web";

import type { DesktopTerminalStatus } from "../../../../shared/desktop-terminals";
import {
  createTerminalViewportGhosttyTerminal,
  focusTerminalViewport,
  loadTerminalViewportGhostty,
} from "./terminal-viewport-ghostty";
import { terminalWriter } from "./terminal-writer";

type Props = {
  className?: string;
  sessionKey: string;
  output: string;
  status: DesktopTerminalStatus;
  onInput: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onLoadError?: (error: Error) => void;
};

type ResizeSnapshot = {
  cols: number;
  rows: number;
};

type PendingResizeSnapshot = ResizeSnapshot & {
  force: boolean;
};

function joinClassName(...items: Array<string | undefined | false>) {
  return items.filter(Boolean).join(" ");
}

function createResizeReporter(input: {
  notify: (cols: number, rows: number) => void;
  setTimer: (callback: VoidFunction, delayMs: number) => number;
  clearTimer: (timerId: number) => void;
  delayMs?: number;
}) {
  let pendingResize: PendingResizeSnapshot | null = null;
  let timerId: number | null = null;
  let lastReported: ResizeSnapshot | null = null;

  const clearScheduled = () => {
    if (timerId === null) {
      return;
    }

    input.clearTimer(timerId);
    timerId = null;
  };

  const flushPending = () => {
    timerId = null;
    const nextSize = pendingResize;
    pendingResize = null;
    if (!nextSize) {
      return;
    }

    if (
      !nextSize.force
      && lastReported?.cols === nextSize.cols
      && lastReported.rows === nextSize.rows
    ) {
      return;
    }

    lastReported = {
      cols: nextSize.cols,
      rows: nextSize.rows,
    };
    input.notify(nextSize.cols, nextSize.rows);
  };

  const report = (cols: number, rows: number, force = false) => {
    if (!force && lastReported?.cols === cols && lastReported.rows === rows) {
      return;
    }

    pendingResize = {
      cols,
      rows,
      force: force || pendingResize?.force === true,
    };

    if (force || !lastReported) {
      pendingResize = null;
      clearScheduled();
      lastReported = { cols, rows };
      input.notify(cols, rows);
      return;
    }

    if (timerId !== null) {
      return;
    }

    timerId = input.setTimer(flushPending, input.delayMs ?? 100);
  };

  const reset = () => {
    clearScheduled();
    pendingResize = null;
    lastReported = null;
  };

  return {
    report,
    reset,
  };
}

export function TerminalViewport(props: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<GhosttyTerminal | null>(null);
  const writerRef = useRef<ReturnType<typeof terminalWriter> | null>(null);
  const fitAddonRef = useRef<GhosttyFitAddon | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const resizeReporterRef = useRef<ReturnType<typeof createResizeReporter> | null>(null);
  const renderedOutputRef = useRef("");
  const outputRef = useRef(props.output);
  const statusRef = useRef(props.status);
  const onInputRef = useRef(props.onInput);
  const onResizeRef = useRef(props.onResize);
  const onLoadErrorRef = useRef(props.onLoadError);

  outputRef.current = props.output;
  statusRef.current = props.status;

  const clearFitFrame = () => {
    if (fitFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(fitFrameRef.current);
    fitFrameRef.current = null;
  };

  const ensureResizeReporter = () => {
    if (!resizeReporterRef.current) {
      resizeReporterRef.current = createResizeReporter({
        notify: (cols, rows) => {
          onResizeRef.current?.(cols, rows);
        },
        setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimer: (timerId) => window.clearTimeout(timerId),
      });
    }

    return resizeReporterRef.current;
  };

  const syncOutput = () => {
    const terminal = terminalRef.current;
    const writer = writerRef.current;
    if (!terminal || !writer) {
      return;
    }

    const nextOutput = outputRef.current;
    const previousOutput = renderedOutputRef.current;
    if (nextOutput === previousOutput) {
      return;
    }

    if (!nextOutput.startsWith(previousOutput)) {
      terminal.reset();
      renderedOutputRef.current = "";
    }

    const baseOutput = renderedOutputRef.current;
    const delta = nextOutput.startsWith(baseOutput)
      ? nextOutput.slice(baseOutput.length)
      : nextOutput;

    if (!delta) {
      return;
    }

    writer.push(delta);
    renderedOutputRef.current = nextOutput;
    writer.flush();
  };

  useEffect(() => {
    onInputRef.current = props.onInput;
  }, [props.onInput]);

  useEffect(() => {
    onResizeRef.current = props.onResize;
  }, [props.onResize]);

  useEffect(() => {
    onLoadErrorRef.current = props.onLoadError;
  }, [props.onLoadError]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let disposed = false;
    const cleanups: Array<() => void> = [];

    const run = async () => {
      const { mod, ghostty } = await loadTerminalViewportGhostty();
      if (disposed) {
        return;
      }

      const terminal = createTerminalViewportGhosttyTerminal(mod, ghostty);
      const fitAddon = new mod.FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(host);
      fitAddon.observeResize();

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      writerRef.current = terminalWriter((data, done) => {
        terminal.write(data, done);
      });
      terminal.options.disableStdin = statusRef.current !== "running";

      const scheduleFit = () => {
        if (fitFrameRef.current !== null) {
          return;
        }

        fitFrameRef.current = window.requestAnimationFrame(() => {
          fitFrameRef.current = null;
          if (disposed) {
            return;
          }

          fitAddon.fit();
        });
      };

      const focusTerminal = () => {
        focusTerminalViewport(host, terminal);
      };

      const dataDisposable = terminal.onData((data) => {
        onInputRef.current(data);
      });
      const resizeDisposable = terminal.onResize((size) => {
        ensureResizeReporter().report(size.cols, size.rows);
      });
      const handleWindowResize = () => {
        scheduleFit();
      };

      host.addEventListener("pointerdown", focusTerminal);
      window.addEventListener("resize", handleWindowResize);
      cleanups.push(() => host.removeEventListener("pointerdown", focusTerminal));
      cleanups.push(() => window.removeEventListener("resize", handleWindowResize));
      cleanups.push(() => resizeDisposable.dispose());
      cleanups.push(() => dataDisposable.dispose());

      scheduleFit();
      if (typeof document !== "undefined" && "fonts" in document) {
        void document.fonts.ready.then(() => {
          if (disposed) {
            return;
          }

          scheduleFit();
        });
      }

      window.requestAnimationFrame(() => {
        if (disposed) {
          return;
        }

        fitAddon.fit();
        ensureResizeReporter().report(terminal.cols, terminal.rows, true);
        syncOutput();
        focusTerminal();
      });
    };

    void run().catch((error) => {
      const normalized = error instanceof Error ? error : new Error(String(error));
      onLoadErrorRef.current?.(normalized);
    });

    return () => {
      disposed = true;
      resizeReporterRef.current?.reset();
      clearFitFrame();
      const cleanupsToRun = cleanups.splice(0).reverse();
      for (const cleanup of cleanupsToRun) {
        cleanup();
      }

      const terminal = terminalRef.current;
      writerRef.current = null;
      fitAddonRef.current = null;
      terminalRef.current = null;
      renderedOutputRef.current = "";
      terminal?.dispose();
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const host = hostRef.current;
    if (!terminal) {
      return;
    }

    terminal.reset();
    renderedOutputRef.current = "";
    ensureResizeReporter().reset();

    if (fitAddon && host && host.clientWidth > 0 && host.clientHeight > 0) {
      window.requestAnimationFrame(() => {
        fitAddon.fit();
        ensureResizeReporter().report(terminal.cols, terminal.rows, true);
        syncOutput();
      });
      return;
    }

    ensureResizeReporter().report(terminal.cols, terminal.rows, true);
    syncOutput();
  }, [props.sessionKey]);

  useEffect(() => {
    syncOutput();
  }, [props.output, props.sessionKey]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.disableStdin = props.status !== "running";
  }, [props.status]);

  return (
    <div
      ref={hostRef}
      className={joinClassName("shell-terminal-viewport", props.className)}
    />
  );
}