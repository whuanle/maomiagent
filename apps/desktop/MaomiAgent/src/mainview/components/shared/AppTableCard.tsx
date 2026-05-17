import {
  DoubleLeftOutlined,
  DoubleRightOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import {
  Button,
  Empty,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  type TableColumnsType,
  type TableProps,
} from "antd";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const { Text } = Typography;

type PaginationConfig = {
  total: number;
  currentPage: number;
  currentPageSize: number;
  pageSizeOptions: readonly number[];
  totalLabel: ReactNode;
  pageSizeLabel?: (size: number) => ReactNode;
  onChange: (nextPage: number, nextPageSize: number) => void;
};

type AppTableCardProps<T extends object> = {
  className?: string;
  toolbar?: ReactNode;
  contentBeforeTable?: ReactNode;
  fillHeight?: boolean;
  rowKey: TableProps<T>["rowKey"];
  columns: TableColumnsType<T>;
  items: T[];
  loading?: boolean;
  loadingText: ReactNode;
  emptyDescription: ReactNode;
  pagination?: PaginationConfig;
  scrollX?: string | number | true;
  tableProps?: Omit<
    TableProps<T>,
    "columns" | "dataSource" | "pagination" | "rowKey" | "scroll" | "locale"
  >;
};

const AUTO_VIRTUAL_MIN_ROWS = 120;

type AutoTableRuntimeOptionsInput = {
  fillHeight: boolean;
  scrollX?: string | number | true;
  itemCount: number;
  sticky?: TableProps<object>["sticky"];
  virtual?: TableProps<object>["virtual"];
};

export function resolveAppTableCardRuntimeOptions(input: AutoTableRuntimeOptionsInput) {
  const canAutoVirtualize =
    input.fillHeight
    && typeof input.scrollX === "number"
    && input.itemCount >= AUTO_VIRTUAL_MIN_ROWS;

  return {
    sticky: input.sticky ?? false,
    virtual: input.virtual ?? canAutoVirtualize,
  };
}

function buildPaginationItems(currentPage: number, totalPages: number) {
  const items: Array<number | string> = [];
  const maxVisible = 5;

  if (totalPages <= maxVisible) {
    for (let index = 1; index <= totalPages; index += 1) {
      items.push(index);
    }
    return items;
  }

  if (currentPage <= 3) {
    for (let index = 1; index <= 4; index += 1) {
      items.push(index);
    }
    items.push("...");
    items.push(totalPages);
    return items;
  }

  if (currentPage >= totalPages - 2) {
    items.push(1);
    items.push("...");
    for (let index = totalPages - 3; index <= totalPages; index += 1) {
      items.push(index);
    }
    return items;
  }

  items.push(1);
  items.push("...");
  for (let index = currentPage - 1; index <= currentPage + 1; index += 1) {
    items.push(index);
  }
  items.push("...");
  items.push(totalPages);
  return items;
}

function defaultPageSizeLabel(size: number) {
  return `${size} 条/页`;
}

export function AppTableCard<T extends object>(props: AppTableCardProps<T>) {
  const {
    className,
    toolbar,
    contentBeforeTable,
    fillHeight = true,
    rowKey,
    columns,
    items,
    loading = false,
    loadingText,
    emptyDescription,
    pagination,
    scrollX,
    tableProps,
  } = props;
  const {
    className: rawTableClassName,
    style: rawTableStyle,
    sticky: rawTableSticky,
    virtual: rawTableVirtual,
    ...restTableProps
  } = tableProps ?? {};

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollY, setTableScrollY] = useState(360);

  const updateTableScrollY = useCallback(() => {
    if (!fillHeight) {
      return;
    }

    const viewportNode = viewportRef.current;
    if (!viewportNode) {
      return;
    }

    const headerHeight =
      viewportNode.querySelector<HTMLElement>(".ant-table-header")?.offsetHeight ?? 0;
    const summaryHeight =
      viewportNode.querySelector<HTMLElement>(".ant-table-summary")?.offsetHeight ?? 0;
    const titleHeight =
      viewportNode.querySelector<HTMLElement>(".ant-table-title")?.offsetHeight ?? 0;
    const stickyScrollbarHeight =
      viewportNode.querySelector<HTMLElement>(".ant-table-sticky-scroll")?.offsetHeight ?? 0;

    const nextScrollHeight = Math.max(
      220,
      viewportNode.clientHeight
        - headerHeight
        - summaryHeight
        - titleHeight
        - stickyScrollbarHeight,
    );

    setTableScrollY((previous) =>
      Math.abs(previous - nextScrollHeight) > 1 ? nextScrollHeight : previous,
    );
  }, [fillHeight]);

  useLayoutEffect(() => {
    if (!fillHeight) {
      return;
    }

    const viewportNode = viewportRef.current;
    if (!viewportNode) {
      return;
    }

    let frameId = 0;

    const scheduleUpdate = () => {
      if (typeof window === "undefined") {
        updateTableScrollY();
        return;
      }

      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateTableScrollY);
    };

    scheduleUpdate();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => scheduleUpdate());

    observer?.observe(viewportNode);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (typeof window !== "undefined") {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", scheduleUpdate);
      }
      observer?.disconnect();
    };
  }, [fillHeight, updateTableScrollY]);

  useLayoutEffect(() => {
    if (!fillHeight) {
      return;
    }
    updateTableScrollY();
  }, [fillHeight, updateTableScrollY]);

  const totalPages = useMemo(
    () =>
      pagination
        ? Math.max(1, Math.ceil(pagination.total / pagination.currentPageSize))
        : 1,
    [pagination],
  );

  const paginationItems = useMemo(
    () => (pagination ? buildPaginationItems(pagination.currentPage, totalPages) : []),
    [pagination, totalPages],
  );

  const pageSizeLabel = pagination?.pageSizeLabel ?? defaultPageSizeLabel;
  const tableClassName = ["app-data-table", "app-table-card-table", rawTableClassName]
    .filter(Boolean)
    .join(" ");
  const runtimeOptions = resolveAppTableCardRuntimeOptions({
    fillHeight,
    scrollX,
    itemCount: items.length,
    sticky: rawTableSticky as TableProps<object>["sticky"] | undefined,
    virtual: rawTableVirtual as TableProps<object>["virtual"] | undefined,
  });
  const mergedSticky = runtimeOptions.sticky;
  const mergedVirtual = runtimeOptions.virtual;
  const tableStyle = fillHeight
    ? {
        flex: 1,
        minHeight: 0,
        ...(rawTableStyle ?? {}),
      }
    : (rawTableStyle ?? {});
  const tableScroll = fillHeight
    ? scrollX
      ? { x: scrollX, y: tableScrollY }
      : { y: tableScrollY }
    : scrollX
      ? { x: scrollX }
      : undefined;

  return (
    <section
      className={`app-table-card${fillHeight ? " app-table-card-fill" : " app-table-card-auto"}${className ? ` ${className}` : ""}`}
    >
      <div className="app-table-card-body">
        {toolbar ? (
          <div className="app-table-card-toolbar">
            {toolbar}
          </div>
        ) : null}

        {contentBeforeTable ? (
          <div className="app-table-card-content-before">
            {contentBeforeTable}
          </div>
        ) : null}

        <div ref={viewportRef} className="app-table-card-viewport">
          <Table
            rowKey={rowKey}
            size="middle"
            tableLayout="fixed"
            className={tableClassName}
            style={tableStyle}
            columns={columns}
            dataSource={items}
            pagination={false}
            scroll={tableScroll}
            sticky={mergedSticky}
            virtual={mergedVirtual}
            locale={{
              emptyText: loading ? (
                <div
                  className="app-table-card-empty-loading"
                  aria-label={typeof loadingText === "string" ? loadingText : undefined}
                >
                  <Spin size="large" />
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
              ),
            }}
            {...restTableProps}
          />
        </div>

        {pagination ? (
          <div className="app-table-card-footer">
            <Text type="secondary">{pagination.totalLabel}</Text>

            <div className="app-table-card-footer-actions">
              <Select
                size="small"
                value={String(pagination.currentPageSize)}
                onChange={(value) => pagination.onChange(1, Number(value))}
                className="app-table-card-page-size"
                options={pagination.pageSizeOptions.map((size) => ({
                  label: pageSizeLabel(size),
                  value: String(size),
                }))}
              />

              <Space size={4} wrap>
                <Button
                  size="small"
                  icon={<DoubleLeftOutlined />}
                  disabled={pagination.currentPage <= 1}
                  onClick={() => pagination.onChange(1, pagination.currentPageSize)}
                />
                <Button
                  size="small"
                  icon={<LeftOutlined />}
                  disabled={pagination.currentPage <= 1}
                  onClick={() =>
                    pagination.onChange(pagination.currentPage - 1, pagination.currentPageSize)
                  }
                />
                {paginationItems.map((item, index) =>
                  item === "..." ? (
                    <Text
                      key={`ellipsis-${index}`}
                      type="secondary"
                      className="app-table-card-ellipsis"
                    >
                      ...
                    </Text>
                  ) : (
                    <Button
                      key={`page-${item}`}
                      size="small"
                      type={pagination.currentPage === item ? "primary" : "default"}
                      onClick={() => pagination.onChange(Number(item), pagination.currentPageSize)}
                    >
                      {item}
                    </Button>
                  ),
                )}
                <Button
                  size="small"
                  icon={<RightOutlined />}
                  disabled={pagination.currentPage >= totalPages}
                  onClick={() =>
                    pagination.onChange(pagination.currentPage + 1, pagination.currentPageSize)
                  }
                />
                <Button
                  size="small"
                  icon={<DoubleRightOutlined />}
                  disabled={pagination.currentPage >= totalPages}
                  onClick={() => pagination.onChange(totalPages, pagination.currentPageSize)}
                />
              </Space>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}