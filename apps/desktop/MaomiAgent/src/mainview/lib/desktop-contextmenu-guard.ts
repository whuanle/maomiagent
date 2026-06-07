const CONTEXT_MENU_ALLOW_SELECTOR = "[data-allow-context-menu]";

type ContextMenuLikeEvent = Pick<Event, "defaultPrevented" | "target">;
type ClosestCapableTarget = {
  closest: (selector: string) => unknown;
};

type DesktopContextMenuGuardDocument = Document & {
  __maomiDesktopContextMenuGuardCleanup?: () => void;
};

export function findContextMenuAllowTarget(target: EventTarget | null): object | null {
  if (!target || typeof target !== "object" || !("closest" in target)) {
    return null;
  }

  const maybeTarget = target as ClosestCapableTarget;
  if (typeof maybeTarget.closest !== "function") {
    return null;
  }

  const allowTarget = maybeTarget.closest(CONTEXT_MENU_ALLOW_SELECTOR);
  return allowTarget && typeof allowTarget === "object"
    ? allowTarget
    : null;
}

export function shouldBlockDesktopContextMenu(event: ContextMenuLikeEvent): boolean {
  if (event.defaultPrevented) {
    return false;
  }

  return findContextMenuAllowTarget(event.target) === null;
}

export function installDesktopContextMenuGuard(doc: Document = document): () => void {
  const guardDocument = typeof document !== "undefined" && doc === document
    ? doc as DesktopContextMenuGuardDocument
    : null;
  if (guardDocument?.__maomiDesktopContextMenuGuardCleanup) {
    return guardDocument.__maomiDesktopContextMenuGuardCleanup;
  }

  const handleContextMenu = (event: MouseEvent) => {
    if (!shouldBlockDesktopContextMenu(event)) {
      return;
    }

    event.preventDefault();
  };

  doc.addEventListener("contextmenu", handleContextMenu, { capture: true });

  const cleanup = () => {
    doc.removeEventListener("contextmenu", handleContextMenu, { capture: true });

    if (guardDocument?.__maomiDesktopContextMenuGuardCleanup === cleanup) {
      delete guardDocument.__maomiDesktopContextMenuGuardCleanup;
    }
  };

  if (guardDocument) {
    guardDocument.__maomiDesktopContextMenuGuardCleanup = cleanup;
  }

  return cleanup;
}
