import type { ReactNode } from "react";

type Props = {
  toolbar: ReactNode;
  main: ReactNode;
};

export function MemoryPageLayout(props: Props) {
  return (
    <div className="memory-page-shell">
      {props.toolbar}
      <div className="memory-page-content">
        {props.main}
      </div>
    </div>
  );
}
