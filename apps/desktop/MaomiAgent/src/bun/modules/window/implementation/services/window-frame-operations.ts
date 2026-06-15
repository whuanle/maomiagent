import type { DesktopWindowFrame } from "../../abstraction/models/desktop-window";

const MIN_WINDOW_WIDTH = 480;
const MIN_WINDOW_HEIGHT = 320;
const MIN_VISIBLE_TITLEBAR_HEIGHT = 56;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type DesktopWindowResizeEdge =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

export type DesktopWindowResizeRequest = {
  edge: DesktopWindowResizeEdge;
  startFrame: DesktopWindowFrame;
  startScreenX: number;
  startScreenY: number;
  screenX: number;
  screenY: number;
};

export function resolveCenteredFrameInWorkArea(input: {
  workArea: DesktopWindowFrame;
  frame: Pick<DesktopWindowFrame, "width" | "height">;
}): DesktopWindowFrame {
  const width = clamp(
    Math.round(input.frame.width),
    Math.min(MIN_WINDOW_WIDTH, input.workArea.width),
    input.workArea.width,
  );
  const height = clamp(
    Math.round(input.frame.height),
    Math.min(MIN_WINDOW_HEIGHT, input.workArea.height),
    input.workArea.height,
  );

  return {
    x: Math.round(input.workArea.x + (input.workArea.width - width) / 2),
    y: Math.round(input.workArea.y + (input.workArea.height - height) / 2),
    width,
    height,
  };
}

export function resizeFrameFromPointer(input: DesktopWindowResizeRequest): DesktopWindowFrame {
  const deltaX = Math.round(input.screenX - input.startScreenX);
  const deltaY = Math.round(input.screenY - input.startScreenY);
  const nextFrame = {
    ...input.startFrame,
  };

  if (input.edge.includes("e")) {
    nextFrame.width = Math.max(MIN_WINDOW_WIDTH, Math.round(input.startFrame.width + deltaX));
  }

  if (input.edge.includes("s")) {
    nextFrame.height = Math.max(MIN_WINDOW_HEIGHT, Math.round(input.startFrame.height + deltaY));
  }

  if (input.edge.includes("w")) {
    const requestedWidth = Math.max(
      MIN_WINDOW_WIDTH,
      Math.round(input.startFrame.width - deltaX),
    );
    const consumedWidth = requestedWidth - input.startFrame.width;
    nextFrame.width = requestedWidth;
    nextFrame.x = Math.round(input.startFrame.x - consumedWidth);
  }

  if (input.edge.includes("n")) {
    const requestedHeight = Math.max(
      MIN_WINDOW_HEIGHT,
      Math.round(input.startFrame.height - deltaY),
    );
    const consumedHeight = requestedHeight - input.startFrame.height;
    nextFrame.height = requestedHeight;
    nextFrame.y = Math.round(input.startFrame.y - consumedHeight);
  }

  return nextFrame;
}

export function resolveRestoreFrameForDrag(input: {
  maximizedFrame: DesktopWindowFrame;
  restoreFrame: DesktopWindowFrame;
  dragPointer: {
    offsetX: number;
    offsetY: number;
    windowWidth: number;
  };
}): DesktopWindowFrame {
  const pointerScreenX = input.maximizedFrame.x + input.dragPointer.offsetX;
  const pointerScreenY = input.maximizedFrame.y + input.dragPointer.offsetY;
  const pointerRatioX = clamp(
    input.dragPointer.offsetX / Math.max(1, input.dragPointer.windowWidth),
    0,
    1,
  );
  const targetX = Math.round(pointerScreenX - input.restoreFrame.width * pointerRatioX);
  const targetY = Math.round(
    pointerScreenY - clamp(input.dragPointer.offsetY, 8, 72),
  );

  const minX = Math.round(input.maximizedFrame.x);
  const maxX = Math.round(
    input.maximizedFrame.x + input.maximizedFrame.width - input.restoreFrame.width,
  );
  const minY = Math.round(input.maximizedFrame.y);
  const maxY = Math.round(
    input.maximizedFrame.y + input.maximizedFrame.height - Math.min(
      MIN_VISIBLE_TITLEBAR_HEIGHT,
      input.restoreFrame.height,
    ),
  );

  return {
    x: clamp(targetX, minX, Math.max(minX, maxX)),
    y: clamp(targetY, minY, Math.max(minY, maxY)),
    width: input.restoreFrame.width,
    height: input.restoreFrame.height,
  };
}
