import { Alert, Tag } from "antd";

type DesignerStatusBarProps = {
  lockReason?: string;
  missingItems: string[];
};

export function DesignerStatusBar(props: DesignerStatusBarProps) {
  if (props.lockReason) {
    return (
      <Alert
        className="ui-designer-status-bar"
        type="warning"
        showIcon
        message="当前工作区正在执行任务"
        description={props.lockReason}
      />
    );
  }

  if (props.missingItems.length === 0) {
    return null;
  }

  return (
    <div className="ui-designer-status-bar">
      {props.missingItems.map((item) => <Tag key={item} color="gold">{item}</Tag>)}
    </div>
  );
}
