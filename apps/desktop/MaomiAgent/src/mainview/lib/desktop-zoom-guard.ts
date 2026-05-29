const DESKTOP_ZOOM_SHORTCUT_KEYS = new Set(["+", "=", "-", "_", "0"]);
const DESKTOP_ZOOM_SHORTCUT_CODES = new Set([
  "Equal",
  "Minus",
  "Digit0",
  "NumpadAdd",
  "NumpadSubtract",
  "Numpad0",
]);
const DESKTOP_ZOOM_GESTURE_EVENTS = ["gesturestart", "gesturechange", "gestureend"] as const;

type DesktopZoomKeyboardShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey"
>;

type DesktopZoomWheelShortcutEvent = Pick<WheelEvent, "ctrlKey" | "metaKey">;

type DesktopZoomGuardWindow = Window & {
  __maomiDesktopZoomGuardCleanup?: () => void;
};

export function isDesktopZoomKeyboardShortcut(
  event: DesktopZoomKeyboardShortcutEvent,
): boolean {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) {
    return false;
  }

  return DESKTOP_ZOOM_SHORTCUT_KEYS.has(event.key) || DESKTOP_ZOOM_SHORTCUT_CODES.has(event.code);
}

export function isDesktopZoomWheelShortcut(event: DesktopZoomWheelShortcutEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

function preventDesktopZoomGesture(event: Event): void {
  event.preventDefault();
}

export function installDesktopZoomGuard(target: Window = window): () => void {
  const guardWindow = typeof window !== "undefined" && target === window
    ? target as DesktopZoomGuardWindow
    : null;
  if (guardWindow?.__maomiDesktopZoomGuardCleanup) {
    return guardWindow.__maomiDesktopZoomGuardCleanup;
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isDesktopZoomKeyboardShortcut(event)) {
      return;
    }

    event.preventDefault();
  };

  const handleWheel = (event: WheelEvent) => {
    if (!isDesktopZoomWheelShortcut(event)) {
      return;
    }

    event.preventDefault();
  };

  target.addEventListener("keydown", handleKeyDown, { capture: true });
  target.addEventListener("wheel", handleWheel, { capture: true, passive: false });
  for (const eventName of DESKTOP_ZOOM_GESTURE_EVENTS) {
    target.addEventListener(eventName, preventDesktopZoomGesture, {
      capture: true,
      passive: false,
    });
  }

  const cleanup = () => {
    target.removeEventListener("keydown", handleKeyDown, { capture: true });
    target.removeEventListener("wheel", handleWheel, { capture: true });
    for (const eventName of DESKTOP_ZOOM_GESTURE_EVENTS) {
      target.removeEventListener(eventName, preventDesktopZoomGesture, {
        capture: true,
      });
    }

    if (guardWindow?.__maomiDesktopZoomGuardCleanup === cleanup) {
      delete guardWindow.__maomiDesktopZoomGuardCleanup;
    }
  };

  if (guardWindow) {
    guardWindow.__maomiDesktopZoomGuardCleanup = cleanup;
  }

  return cleanup;
}
