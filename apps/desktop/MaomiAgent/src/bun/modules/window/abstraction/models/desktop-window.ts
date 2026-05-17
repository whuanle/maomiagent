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
    isMinimized: () => boolean;
    on: (name: string, handler: (event: unknown) => void) => void;
    show: () => void;
    unminimize: () => void;
  },
  "focus" | "isMinimized" | "on" | "show" | "unminimize"
>;