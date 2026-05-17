import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import App from "./App";
import { AppErrorBoundary } from "./components/system/AppErrorBoundary";
import { readShellPreferences } from "./lib/shell-preferences";
import "./styles.css";
import { applyThemeStylesheet } from "./theme/theme-stylesheet";

const initialPreferences = readShellPreferences();
const STARTUP_SPLASH_ID = "app-startup-splash";
const STARTUP_SPLASH_HIDDEN_CLASS = "is-hidden";
const STARTUP_SPLASH_FALLBACK_REMOVE_DELAY_MS = 240;

applyThemeStylesheet(initialPreferences.themeMode);
Spin.setDefaultIndicator(<LoadingOutlined spin />);

function dismissStartupSplash() {
  if (typeof document === "undefined") {
    return;
  }

  const splash = document.getElementById(STARTUP_SPLASH_ID);
  if (!(splash instanceof HTMLElement)) {
    return;
  }

  let removed = false;
  const removeSplash = () => {
    if (removed) {
      return;
    }
    removed = true;
    splash.remove();
  };

  splash.addEventListener("transitionend", removeSplash, { once: true });
  splash.classList.add(STARTUP_SPLASH_HIDDEN_CLASS);
  window.setTimeout(removeSplash, STARTUP_SPLASH_FALLBACK_REMOVE_DELAY_MS);
}

function queueStartupSplashDismiss() {
  if (typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      dismissStartupSplash();
    });
  });
}

const rootElement = document.getElementById("root");
if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Mainview root element was not found.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);

queueStartupSplashDismiss();
