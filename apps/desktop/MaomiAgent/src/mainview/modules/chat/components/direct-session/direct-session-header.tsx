import type { DirectSessionHeaderViewModel } from "./types";

type Props = {
  header: DirectSessionHeaderViewModel;
};

export function DirectSessionHeader(props: Props) {
  return (
    <header className="chat-direct-session-strip" aria-label={props.header.ariaLabel}>
      <div className="chat-direct-session-strip-main">
        <div className="chat-direct-session-strip-title-row">
          <h2 className="chat-direct-session-strip-title" title={props.header.titleHint}>
            {props.header.title}
          </h2>
        </div>
        <span className={`chat-direct-session-strip-status is-${props.header.statusTone}`}>
          {props.header.statusLabel}
        </span>
      </div>
    </header>
  );
}

export default DirectSessionHeader;