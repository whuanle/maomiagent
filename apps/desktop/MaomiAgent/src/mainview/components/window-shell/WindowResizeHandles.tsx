import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import {
  DESKTOP_WINDOW_BRIDGE_READY_EVENT,
  hasDesktopWindowBridge,
  isWindowMaximized,
  runDesktopWindowAction,
  type DesktopWindowResizeEdge,
  type DesktopWindowResizePointer,
} from "../../lib/desktop-window";

type ResizeSession = {
  edge: DesktopWindowResizeEdge;
  startScreenX: number;
  startScreenY: number;
  startFrame: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

const RESIZE_HANDLE_EDGES: DesktopWindowResizeEdge[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];

function createResizePointer(session: ResizeSession, event: MouseEvent): DesktopWindowResizePointer {
  return {
    edge: session.edge,
    startScreenX: session.startScreenX,
    startScreenY: session.startScreenY,
    screenX: event.screenX,
    screenY: event.screenY,
    startFrame: session.startFrame,
  };
}

export function WindowResizeHandles() {
  const [hasWindowControls, setHasWindowControls] = useState(() => hasDesktopWindowBridge());
  const [maximized, setMaximized] = useState(false);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const pendingPointerRef = useRef<DesktopWindowResizePointer | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const syncWindowState = () => {
      const ready = hasDesktopWindowBridge();
      setHasWindowControls(ready);
      if (!ready) {
        setMaximized(false);
        return;
      }

      void isWindowMaximized().then(setMaximized);
    };

    syncWindowState();
    window.addEventListener(DESKTOP_WINDOW_BRIDGE_READY_EVENT, syncWindowState);
    window.addEventListener("resize", syncWindowState);
    return () => {
      window.removeEventListener(DESKTOP_WINDOW_BRIDGE_READY_EVENT, syncWindowState);
      window.removeEventListener("resize", syncWindowState);
    };
  }, []);

  useEffect(() => {
    const flushResize = () => {
      rafIdRef.current = null;
      const pointer = pendingPointerRef.current;
      if (!pointer) {
        return;
      }

      pendingPointerRef.current = null;
      void runDesktopWindowAction("resizeWindow", undefined, pointer);
    };

    const handleMouseMove = (event: MouseEvent) => {
      const session = resizeSessionRef.current;
      if (!session) {
        return;
      }

      pendingPointerRef.current = createResizePointer(session, event);
      if (rafIdRef.current === null) {
        rafIdRef.current = window.requestAnimationFrame(flushResize);
      }
    };

    const handleMouseUp = () => {
      resizeSessionRef.current = null;
      pendingPointerRef.current = null;
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleMouseUp);
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const handleMouseDown = (edge: DesktopWindowResizeEdge) => (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!hasWindowControls || maximized || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    resizeSessionRef.current = {
      edge,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startFrame: {
        x: Math.round(window.screenX),
        y: Math.round(window.screenY),
        width: Math.round(window.outerWidth),
        height: Math.round(window.outerHeight),
      },
    };
  };

  const handleClassNames = useMemo(() => {
    return Object.fromEntries(
      RESIZE_HANDLE_EDGES.map((edge) => [
        edge,
        `window-resize-handle window-resize-handle--${edge}`,
      ]),
    ) as Record<DesktopWindowResizeEdge, string>;
  }, []);

  if (!hasWindowControls || maximized) {
    return null;
  }

  return (
    <>
      {RESIZE_HANDLE_EDGES.map((edge) => (
        <div
          key={edge}
          className={handleClassNames[edge]}
          onMouseDown={handleMouseDown(edge)}
        />
      ))}
    </>
  );
}
