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

applyThemeStylesheet(initialPreferences.themeMode);
Spin.setDefaultIndicator(<LoadingOutlined spin />);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);