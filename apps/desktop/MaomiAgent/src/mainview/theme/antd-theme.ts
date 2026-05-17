import { theme, type ThemeConfig } from "antd"

export const APP_THEME_MODES = [
  "light",
  "light-modern",
  "light-eye-care",
  "dark",
  "tomorrow-night-blue",
  "github",
] as const

export type AppThemeMode = (typeof APP_THEME_MODES)[number]

export const DEFAULT_THEME_MODE: AppThemeMode = "light"

export const THEME_STORAGE_KEY = "maomiagent.theme"
export const THEME_STORAGE_COMPAT_KEYS = [THEME_STORAGE_KEY] as const

const sharedTheme: ThemeConfig = {
  token: {
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 8,
    controlHeight: 32,
    controlHeightSM: 28,
    controlHeightLG: 36,
    fontSize: 14,
    fontSizeLG: 15,
    lineHeight: 1.5,
  },
  components: {
    Button: {
      borderRadius: 8,
      controlHeight: 32,
      controlHeightSM: 28,
      controlHeightLG: 36,
      fontWeight: 500,
      defaultShadow: "none",
      primaryShadow: "none",
      dangerShadow: "none",
    },
    Card: {
      borderRadiusLG: 12,
    },
    Descriptions: {
      labelBg: "transparent",
    },
    Table: {
      stickyScrollBarBg: "var(--app-table-scrollbar-thumb)",
      stickyScrollBarBorderRadius: 999,
    },
    Tabs: {
      horizontalMargin: "0",
    },
  },
}

const lightTheme: ThemeConfig = {
  ...sharedTheme,
  algorithm: theme.defaultAlgorithm,
  token: {
    ...sharedTheme.token,
    colorBgBase: "#ffffff",
    colorTextBase: "#1f1f1f",
  },
}

const lightModernTheme: ThemeConfig = {
  ...sharedTheme,
  algorithm: theme.defaultAlgorithm,
  token: {
    ...sharedTheme.token,
    colorPrimary: "#4a8ef0",
    colorLink: "#4a8ef0",
    colorSuccess: "#107c10",
    colorWarning: "#9d6c00",
    colorError: "#c42b1c",
    colorBgBase: "#eaf4ff",
    colorBgLayout: "#e7f1ff",
    colorBgContainer: "#f7fbff",
    colorBgElevated: "#fbfdff",
    colorFillAlter: "#e2eeff",
    colorBorder: "#c8daf4",
    colorBorderSecondary: "#dce9fb",
    colorTextBase: "#17314f",
  },
}

const lightEyeCareTheme: ThemeConfig = {
  ...sharedTheme,
  algorithm: theme.defaultAlgorithm,
  token: {
    ...sharedTheme.token,
    colorPrimary: "#5a9b60",
    colorLink: "#4f8a55",
    colorSuccess: "#2f7d32",
    colorWarning: "#9d7422",
    colorError: "#bc4a44",
    colorBgBase: "#edf4eb",
    colorBgLayout: "#e7efe2",
    colorBgContainer: "#f8fcf5",
    colorBgElevated: "#fbfdf9",
    colorFillAlter: "#e2ecdd",
    colorBorder: "#c7d8c0",
    colorBorderSecondary: "#dae6d4",
    colorTextBase: "#243528",
  },
}

const darkTheme: ThemeConfig = {
  ...sharedTheme,
  algorithm: theme.darkAlgorithm,
  token: {
    ...sharedTheme.token,
    colorPrimary: "#4096ff",
    colorLink: "#91caff",
    colorSuccess: "#49d17d",
    colorWarning: "#faad14",
    colorError: "#ff4d4f",
    colorBgBase: "#0f1115",
    colorTextBase: "#f3f6fb",
  },
}

const tomorrowNightBlueTheme: ThemeConfig = {
  ...sharedTheme,
  algorithm: theme.darkAlgorithm,
  token: {
    ...sharedTheme.token,
    colorPrimary: "#7ab8ff",
    colorLink: "#a3ccff",
    colorSuccess: "#7bdcb5",
    colorWarning: "#f1cb7e",
    colorError: "#ff9e93",
    colorBgBase: "#07182f",
    colorTextBase: "#edf5ff",
  },
}

const githubTheme: ThemeConfig = {
  ...sharedTheme,
  algorithm: theme.defaultAlgorithm,
  token: {
    ...sharedTheme.token,
    colorPrimary: "#0969da",
    colorLink: "#0969da",
    colorSuccess: "#1f883d",
    colorWarning: "#9a6700",
    colorError: "#cf222e",
    colorBgBase: "#ffffff",
    colorTextBase: "#1f2328",
  },
}

export function isAppThemeMode(value: unknown): value is AppThemeMode {
  return typeof value === "string"
    && (APP_THEME_MODES as readonly string[]).includes(value)
}

export function normalizeThemeMode(value: unknown): AppThemeMode {
  return isAppThemeMode(value) ? value : DEFAULT_THEME_MODE
}

export function isDarkThemeMode(mode: AppThemeMode): boolean {
  return mode === "dark" || mode === "tomorrow-night-blue"
}

export function readThemeMode(): AppThemeMode {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_MODE
  }

  for (const key of THEME_STORAGE_COMPAT_KEYS) {
    const value = window.localStorage.getItem(key)
    if (isAppThemeMode(value)) {
      return value
    }
  }

  return DEFAULT_THEME_MODE
}

export function getAntdTheme(mode: AppThemeMode): ThemeConfig {
  if (mode === "light-modern") {
    return lightModernTheme
  }

  if (mode === "light-eye-care") {
    return lightEyeCareTheme
  }

  if (mode === "dark") {
    return darkTheme
  }

  if (mode === "tomorrow-night-blue") {
    return tomorrowNightBlueTheme
  }

  if (mode === "github") {
    return githubTheme
  }

  return lightTheme
}
