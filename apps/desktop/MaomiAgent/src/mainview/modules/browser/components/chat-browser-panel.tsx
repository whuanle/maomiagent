import type { LanguageCode } from "../../../config/titlebar";
import { BrowserShell } from "./browser-shell";

type ChatBrowserPanelProps = {
  active: boolean;
  language: LanguageCode;
};

export function ChatBrowserPanel(props: ChatBrowserPanelProps) {
  return (
    <section className="browser-page-surface browser-page-surface-panel">
      <BrowserShell
        active={props.active}
        language={props.language}
        presentation="panel"
      />
    </section>
  );
}
