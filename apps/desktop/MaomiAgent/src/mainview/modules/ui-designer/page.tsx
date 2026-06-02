import type { UiDesignerPageProps } from "./types";
import { UiDesignerWorkspaceShell } from "./components/workspace-shell";
import "../chat/chat-page.css";
import "./page.css";

export function UiDesignerPage(props: UiDesignerPageProps) {
  return <UiDesignerWorkspaceShell {...props} />;
}

export default UiDesignerPage;
