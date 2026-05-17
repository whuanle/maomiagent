import {
  Card,
  Empty,
  Input,
  Spin,
  Tag,
} from "antd";

import type {
  MemoryRuntimeContext,
  MemorySearchItem,
} from "../../../lib/desktop-memory";
import type { MemoryTranslate } from "../i18n";
import {
  formatScore,
  formatTokenLabel,
  getMemorySubtitle,
  getMemoryTitle,
  truncateText,
} from "../helpers";

const { TextArea } = Input;

type BaseProps = {
  blockedReason?: string;
  t: MemoryTranslate;
};

type UnderstandProps = BaseProps & {
  activeTool: "understand";
  searchLoading: boolean;
  searchItems: MemorySearchItem[];
  runtimeContext: MemoryRuntimeContext;
  runtimeLoading: boolean;
};

type OrganizeProps = BaseProps & {
  activeTool: "organize";
  organizeLoading: boolean;
  organizeSummary: string;
};

type Props = UnderstandProps | OrganizeProps;

export function MemoryMoreToolsDialogContent(props: Props) {
  const { blockedReason, t } = props;

  return (
    <div className="memory-page-more-tools-stack">
      {props.activeTool === "understand" ? (
        <div className="memory-page-modal-form">
          <span>{t("记忆页.更多工具.理解记忆.说明")}</span>

          {props.runtimeLoading ? (
            <div className="memory-page-loading-state">
              <Spin size="small" />
              <span>{t("记忆页.提示.加载中")}</span>
            </div>
          ) : props.runtimeContext.items.length > 0 ? (
            <div className="memory-page-list-stack">
              <span>{t("记忆页.更多工具.理解记忆.当前相关记忆")}</span>
              {props.runtimeContext.items.map((item) => (
                <div key={item.unitId} className="memory-page-runtime-item">
                  <div className="memory-page-search-item-head">
                    <div className="memory-page-search-item-title">{item.summary}</div>
                    {typeof item.score === "number" ? (
                      <div className="memory-page-search-item-score">{formatScore(item.score)}</div>
                    ) : null}
                  </div>
                  <div className="memory-page-chip-row">
                    {item.kind ? (
                      <Tag bordered={false} className="memory-page-inline-tag">
                        {formatTokenLabel(item.kind)}
                      </Tag>
                    ) : null}
                    {item.tier ? (
                      <Tag bordered={false} className="memory-page-inline-tag">
                        {formatTokenLabel(item.tier)}
                      </Tag>
                    ) : null}
                    {item.sourceScope ? (
                      <Tag bordered={false} className="memory-page-inline-tag">
                        {formatTokenLabel(item.sourceScope)}
                      </Tag>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {blockedReason ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={blockedReason} />
          ) : props.searchLoading ? (
            <div className="memory-page-loading-state">
              <Spin size="small" />
              <span>{t("记忆页.提示.加载中")}</span>
            </div>
          ) : props.searchItems.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("记忆页.空状态.无检索结果")} />
          ) : (
            <div className="memory-page-list-stack">
              {props.searchItems.map((item) => (
                <div key={item.unitId} className="memory-page-search-item">
                  <div className="memory-page-search-item-head">
                    <div className="memory-page-search-item-title">{getMemoryTitle(item)}</div>
                    <div className="memory-page-search-item-score">{formatScore(item.score)}</div>
                  </div>
                  {getMemorySubtitle(item) ? (
                    <div className="memory-page-search-item-copy">{getMemorySubtitle(item)}</div>
                  ) : null}
                  <div className="memory-page-chip-row">
                    <Tag bordered={false} className="memory-page-inline-tag">
                      {formatTokenLabel(item.kind)}
                    </Tag>
                    <Tag bordered={false} className="memory-page-inline-tag">
                      {formatTokenLabel(item.sourceScope)}
                    </Tag>
                  </div>
                  <div className="memory-page-search-item-copy">{truncateText(item.explain, 180)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {props.activeTool === "organize" ? (
        <div className="memory-page-modal-form">
          <span>{t("记忆页.更多工具.整理记忆.说明")}</span>

          {blockedReason ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={blockedReason} />
          ) : props.organizeLoading ? (
            <div className="memory-page-loading-state">
              <Spin size="small" />
              <span>{t("记忆页.提示.加载中")}</span>
            </div>
          ) : props.organizeSummary ? (
            <TextArea readOnly autoSize={{ minRows: 4, maxRows: 10 }} value={props.organizeSummary} />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("记忆页.更多工具.整理记忆.空状态")} />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MemoryMoreToolsDialog(props: Props) {
  return (
    <Card variant="borderless" className="panel-card memory-page-section-card">
      <MemoryMoreToolsDialogContent {...props} />
    </Card>
  );
}