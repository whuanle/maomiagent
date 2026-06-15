import type {
  DesktopBrowserWindow,
  DesktopWindowFrame,
} from "../../abstraction/models/desktop-window";

type DisplayGeometry = {
  workArea: DesktopWindowFrame;
  bounds: DesktopWindowFrame;
};

type DesktopScreenApi = {
  getAllDisplays: () => DisplayGeometry[];
  getPrimaryDisplay: () => DisplayGeometry;
};

const MIN_WINDOW_WIDTH = 480;
const MIN_WINDOW_HEIGHT = 320;
const MIN_VISIBLE_TITLEBAR_HEIGHT = 56;
const MIN_VISIBLE_DRAG_WIDTH = 160;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function framesEqual(left: DesktopWindowFrame, right: DesktopWindowFrame): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height;
}

function resolveDisplayWorkAreas(): DesktopWindowFrame[] {
  const screenApi = globalThis.Screen as unknown as DesktopScreenApi | undefined;
  if (!screenApi?.getAllDisplays || !screenApi.getPrimaryDisplay) {
    return [{
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    }];
  }

  const displays = screenApi.getAllDisplays()
    .map((display) => {
      const source = display.workArea.width > 0 && display.workArea.height > 0
        ? display.workArea
        : display.bounds;
      return {
        x: Math.round(source.x),
        y: Math.round(source.y),
        width: Math.round(source.width),
        height: Math.round(source.height),
      };
    })
    .filter((frame) => frame.width > 0 && frame.height > 0);

  if (displays.length > 0) {
    return displays;
  }

  const primaryDisplay = screenApi.getPrimaryDisplay();
  const fallback = primaryDisplay.workArea.width > 0 && primaryDisplay.workArea.height > 0
    ? primaryDisplay.workArea
    : primaryDisplay.bounds;

  return [{
    x: Math.round(fallback.x),
    y: Math.round(fallback.y),
    width: Math.max(1, Math.round(fallback.width)),
    height: Math.max(1, Math.round(fallback.height)),
  }];
}

function resolveIntersectionArea(left: DesktopWindowFrame, right: DesktopWindowFrame): number {
  const overlapWidth = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );

  return overlapWidth * overlapHeight;
}

export function resolveNearestWorkArea(frame: DesktopWindowFrame): DesktopWindowFrame {
  const workAreas = resolveDisplayWorkAreas();
  const frameCenterX = frame.x + frame.width / 2;
  const frameCenterY = frame.y + frame.height / 2;

  let bestWorkArea = workAreas[0]!;
  let bestIntersection = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const workArea of workAreas) {
    const intersection = resolveIntersectionArea(frame, workArea);
    const workAreaCenterX = workArea.x + workArea.width / 2;
    const workAreaCenterY = workArea.y + workArea.height / 2;
    const distance = Math.hypot(frameCenterX - workAreaCenterX, frameCenterY - workAreaCenterY);

    if (intersection > bestIntersection || (intersection === bestIntersection && distance < bestDistance)) {
      bestWorkArea = workArea;
      bestIntersection = intersection;
      bestDistance = distance;
    }
  }

  return bestWorkArea;
}

export function fitFrameToVisibleWorkArea(frame: DesktopWindowFrame): DesktopWindowFrame {
  const workArea = resolveNearestWorkArea(frame);
  const maxWidth = Math.max(1, Math.round(workArea.width));
  const maxHeight = Math.max(1, Math.round(workArea.height));
  const width = clamp(Math.round(frame.width), Math.min(MIN_WINDOW_WIDTH, maxWidth), maxWidth);
  const height = clamp(Math.round(frame.height), Math.min(MIN_WINDOW_HEIGHT, maxHeight), maxHeight);
  const visibleDragWidth = Math.min(MIN_VISIBLE_DRAG_WIDTH, width);
  const visibleTitlebarHeight = Math.min(MIN_VISIBLE_TITLEBAR_HEIGHT, height);
  const minX = Math.round(workArea.x - width + visibleDragWidth);
  const maxX = Math.round(workArea.x + workArea.width - visibleDragWidth);
  const minY = Math.round(workArea.y);
  const maxY = Math.round(workArea.y + workArea.height - visibleTitlebarHeight);

  return {
    x: clamp(Math.round(frame.x), minX, Math.max(minX, maxX)),
    y: clamp(Math.round(frame.y), minY, Math.max(minY, maxY)),
    width,
    height,
  };
}

export function ensureWindowFrameVisible(
  window: Pick<DesktopBrowserWindow, "getFrame" | "setFrame">,
): DesktopWindowFrame {
  const currentFrame = window.getFrame();
  const fittedFrame = fitFrameToVisibleWorkArea(currentFrame);

  if (!framesEqual(currentFrame, fittedFrame)) {
    window.setFrame(fittedFrame.x, fittedFrame.y, fittedFrame.width, fittedFrame.height);
  }

  return fittedFrame;
}
