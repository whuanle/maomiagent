import {
  DownloadOutlined,
  ExpandOutlined,
  MinusOutlined,
  PlusOutlined,
} from "@ant-design/icons"

type Props = {
  toolbarLabel: string
  zoomInLabel: string
  zoomOutLabel: string
  fitLabel: string
  exportSvgLabel: string
  zoomLabel?: string
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onExportSvg: () => void
}

export function FeishuDocDiagramToolbar(props: Props) {
  return (
    <div className="feishu-doc-diagram-toolbar" role="toolbar" aria-label={props.toolbarLabel}>
      <button
        type="button"
        className="feishu-doc-diagram-toolbar-button"
        aria-label={props.zoomInLabel}
        title={props.zoomInLabel}
        onClick={props.onZoomIn}
      >
        <PlusOutlined />
      </button>
      {props.zoomLabel ? (
        <button
          type="button"
          className="feishu-doc-diagram-toolbar-zoom"
          aria-label={props.fitLabel}
          title={props.fitLabel}
          onClick={props.onFit}
        >
          {props.zoomLabel}
        </button>
      ) : null}
      <button
        type="button"
        className="feishu-doc-diagram-toolbar-button"
        aria-label={props.zoomOutLabel}
        title={props.zoomOutLabel}
        onClick={props.onZoomOut}
      >
        <MinusOutlined />
      </button>
      <button
        type="button"
        className="feishu-doc-diagram-toolbar-button"
        aria-label={props.fitLabel}
        title={props.fitLabel}
        onClick={props.onFit}
      >
        <ExpandOutlined />
      </button>
      <button
        type="button"
        className="feishu-doc-diagram-toolbar-button"
        aria-label={props.exportSvgLabel}
        title={props.exportSvgLabel}
        onClick={props.onExportSvg}
      >
        <DownloadOutlined />
      </button>
    </div>
  )
}
