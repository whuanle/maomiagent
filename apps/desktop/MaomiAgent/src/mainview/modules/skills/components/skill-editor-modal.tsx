import { Col, Form, Input, Modal, Row, Switch, type FormInstance } from "antd";
import type { Translate } from "../../../i18n";
import type { DesktopSkillItem } from "../../../../shared/desktop-skills";
import { initialSkillFormValues, skillIdPattern, type SkillFormValues } from "./helpers";

export function SkillEditorModal(props: {
  t: Translate;
  open: boolean;
  saving: boolean;
  editingSkill: DesktopSkillItem | null;
  form: FormInstance<SkillFormValues>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { editingSkill, form, open, saving, t } = props;

  return (
    <Modal
      open={open}
      width={720}
      destroyOnHidden={false}
      maskClosable={false}
      title={editingSkill ? t("技能页.弹窗.标题.编辑") : t("技能页.弹窗.标题.接入")}
      okText={editingSkill ? t("技能页.按钮.保存") : t("技能页.按钮.接入")}
      cancelText={t("技能页.按钮.取消")}
      confirmLoading={saving}
      onCancel={props.onCancel}
      onOk={props.onSubmit}
    >
      <Form form={form} layout="vertical" initialValues={initialSkillFormValues}>
        <Form.Item
          label={t("技能页.字段.技能ID")}
          name="skillId"
          rules={[
            { required: true, message: t("技能页.校验.skillId必填") },
            { pattern: skillIdPattern, message: t("技能页.校验.skillId格式") },
          ]}
        >
          <Input disabled={Boolean(editingSkill)} placeholder="filesystem-helper" />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label={t("技能页.字段.名称")} name="name">
              <Input placeholder={t("技能页.输入.名称占位")} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={t("技能页.字段.显示标签")} name="label">
              <Input placeholder={t("技能页.输入.标签占位")} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label={t("技能页.字段.来源路径")} name="sourcePath">
          <Input placeholder={t("技能页.输入.来源路径占位")} />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} md={16}>
            <Form.Item label={t("技能页.字段.标签")} name="tagsText">
              <Input placeholder={t("技能页.输入.标签列表占位")} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label={t("技能页.字段.启用")} name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label={t("技能页.字段.描述")} name="description">
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </Modal>
  );
}