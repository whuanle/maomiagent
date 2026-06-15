export type DesktopWindowFrame = {
  width: number;
  height: number;
  x: number;
  y: number;
};

export type DesktopWindowOptions = {
  title: string;
  url: string;
  frame: DesktopWindowFrame;
};

export type DesktopBrowserWindow = Pick<
  {
    focus: () => void;
    getFrame: () => DesktopWindowFrame;
    isFullScreen: () => boolean;
    isMaximized: () => boolean;
    isMinimized: () => boolean;
    on: (name: string, handler: (event: unknown) => void) => void;
    setFrame: (x: number, y: number, width: number, height: number) => void;
    show: () => void;
    unminimize: () => void;
    unmaximize: () => void;
  },
  | "focus"
  | "getFrame"
  | "isFullScreen"
  | "isMaximized"
  | "isMinimized"
  | "on"
  | "setFrame"
  | "show"
  | "unminimize"
  | "unmaximize"
>;
