import type { Ghostty, Terminal as GhosttyTerminal } from "ghostty-web";

let sharedGhostty: Promise<{ mod: typeof import("ghostty-web"); ghostty: Ghostty }> | undefined;

export function loadTerminalViewportGhostty() {
  if (sharedGhostty) {
    return sharedGhostty;
  }

  sharedGhostty = import("ghostty-web")
    .then(async (mod) => ({ mod, ghostty: await mod.Ghostty.load() }))
    .catch((error) => {
      sharedGhostty = undefined;
      throw error;
    });

  return sharedGhostty;
}

export function createTerminalViewportGhosttyTerminal(
  mod: typeof import("ghostty-web"),
  ghostty: Ghostty,
) {
  return new mod.Terminal({
    allowTransparency: false,
    convertEol: false,
    cursorBlink: true,
    cursorStyle: "bar",
    fontFamily: '"Cascadia Mono", "JetBrains Mono", Consolas, monospace',
    fontSize: 13,
    ghostty,
    scrollback: 10_000,
    theme: {
      background: "#0b1120",
      foreground: "#dbe7ff",
      cursor: "#f8d66d",
      cursorAccent: "#0b1120",
      selectionBackground: "rgba(96, 165, 250, 0.22)",
      black: "#0f172a",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#facc15",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#e2e8f0",
      brightBlack: "#64748b",
      brightRed: "#fb7185",
      brightGreen: "#86efac",
      brightYellow: "#fde047",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#f8fafc",
    },
  });
}

export function focusTerminalViewport(host: HTMLDivElement, terminal: GhosttyTerminal) {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement
    && activeElement !== host
    && !host.contains(activeElement)
  ) {
    activeElement.blur();
  }

  terminal.focus();
  terminal.textarea?.focus();
  window.setTimeout(() => {
    terminal.textarea?.focus();
  }, 0);
}