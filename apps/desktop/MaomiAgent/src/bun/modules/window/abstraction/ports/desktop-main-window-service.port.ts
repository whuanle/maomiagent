import type {
  DesktopBrowserWindow,
} from "../models/desktop-window";

export type DesktopMainWindowServicePort = {
  ensureMainWindow: () => DesktopBrowserWindow;
  activateMainWindow: () => void;
  getMainWindow: () => DesktopBrowserWindow | null;
};