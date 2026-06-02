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

  return (
    <div className="ui-designer-status-bar">
      <span className="ui-designer-status-bar-label">生成条件</span>
      {props.missingItems.length === 0
        ? <Tag color="success">已就绪</Tag>
        : props.missingItems.map((item) => <Tag key={item} color="gold">{item}</Tag>)}
    </div>
  );
}
