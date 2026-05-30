import { Modal } from "antd"
import type { ReactNode } from "react"

type Props = {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function FeishuDocDiagramPreviewModal(props: Props) {
  return (
    <Modal
      rootClassName="feishu-doc-diagram-preview-modal"
      open={props.open}
      title={null}
      footer={null}
      onCancel={props.onClose}
      width="min(1560px, calc(100vw - 32px))"
      style={{ top: 72 }}
      destroyOnClose
    >
      <div className="feishu-doc-diagram-preview-modal-body">
        {props.children}
      </div>
    </Modal>
  )
}
