import type { ReactNode } from "react";

type Props = {
  label: string;
  wide?: boolean;
  children: ReactNode;
};

export function WechatToolbarField(props: Props) {
  return (
    <div className={`wechat-page-field${props.wide ? " wechat-page-field-wide" : ""}`}>
      <label>{props.label}</label>
      {props.children}
    </div>
  );
}

export default WechatToolbarField;
