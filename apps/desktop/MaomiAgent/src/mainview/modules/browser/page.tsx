import type { LanguageCode } from "../../config/titlebar";
import { BrowserShell } from "./components/browser-shell";

type Props = {
  language: LanguageCode;
  active: boolean;
};

export function BrowserPage(props: Props) {
  return (
    <section className="browser-page">
      <div className="browser-page-surface">
        <BrowserShell active={props.active} language={props.language} presentation="page" />
      </div>
    </section>
  );
}
