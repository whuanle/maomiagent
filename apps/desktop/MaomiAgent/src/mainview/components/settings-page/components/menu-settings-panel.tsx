import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, List, Space, Switch } from "antd";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from "lucide-react";
import { resolveRouteLabel, type TitlebarMenuItem } from "../../../config/titlebar";
import type { Translate } from "../../../i18n";
import type { TitlebarMenuDropPosition } from "../../../lib/titlebar-menu-settings";

type Props = {
  t: Translate;
  menuItems: TitlebarMenuItem[];
  collapsedMenuKeys: TitlebarMenuItem["key"][];
  onMenuCollapsedChange: (key: TitlebarMenuItem["key"], collapsed: boolean) => void;
  onMoveMenuItem: (key: TitlebarMenuItem["key"], direction: "up" | "down") => void;
  onReorderMenuItems: (
    sourceKey: TitlebarMenuItem["key"],
    targetKey: TitlebarMenuItem["key"],
    position: TitlebarMenuDropPosition,
  ) => void;
  onResetMenuSettings: () => void;
};

export function MenuSettingsPanel(props: Props) {
  const collapsedKeySet = new Set(props.collapsedMenuKeys);
  const [draggingKey, setDraggingKey] = useState<TitlebarMenuItem["key"] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: TitlebarMenuItem["key"]; position: TitlebarMenuDropPosition } | null>(null);
  const dragStateRef = useRef<{ pointerId: number; key: TitlebarMenuItem["key"] } | null>(null);
  const dropTargetRef = useRef<{ key: TitlebarMenuItem["key"]; position: TitlebarMenuDropPosition } | null>(null);

  useEffect(() => {
    dropTargetRef.current = dropTarget;
  }, [dropTarget]);

  useEffect(() => {
    if (!draggingKey) {
      return;
    }

    document.body.classList.add("settings-page-is-sorting");

    const handlePointerMove = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return;
      }

      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const itemElement = target?.closest<HTMLElement>("[data-settings-menu-key]");
      const targetKey = itemElement?.dataset.settingsMenuKey as TitlebarMenuItem["key"] | undefined;

      if (!itemElement || !targetKey || targetKey === draggingKey) {
        setDropTarget(null);
        return;
      }

      const bounds = itemElement.getBoundingClientRect();
      const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
      setDropTarget((current) => current?.key === targetKey && current.position === position
        ? current
        : { key: targetKey, position });
    };

    const resetDragState = () => {
      dragStateRef.current = null;
      dropTargetRef.current = null;
      setDraggingKey(null);
      setDropTarget(null);
    };

    const finishDrag = (pointerId?: number) => {
      if (pointerId !== undefined && dragStateRef.current?.pointerId !== pointerId) {
        return;
      }
      const sourceKey = dragStateRef.current?.key;
      const currentDropTarget = dropTargetRef.current;
      if (sourceKey && currentDropTarget && sourceKey !== currentDropTarget.key) {
        props.onReorderMenuItems(sourceKey, currentDropTarget.key, currentDropTarget.position);
      }
      resetDragState();
    };

    const handlePointerUp = (event: PointerEvent) => finishDrag(event.pointerId);
    const handlePointerCancel = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId === event.pointerId) {
        resetDragState();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("blur", resetDragState);

    return () => {
      document.body.classList.remove("settings-page-is-sorting");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("blur", resetDragState);
    };
  }, [draggingKey, props]);

  const handleSortPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: TitlebarMenuItem["key"],
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = { pointerId: event.pointerId, key };
    setDraggingKey(key);
    setDropTarget(null);
  };

  const resolvePlacementText = (collapsed: boolean) => (
    collapsed ? props.t("设置页.值.菜单位置.更多") : props.t("设置页.值.菜单位置.标题栏")
  );

  return (
    <div className="settings-page-menu-panel">
      <div className="settings-page-toolbar">
        <Button icon={<RotateCcw size={15} />} onClick={props.onResetMenuSettings}>
          {props.t("设置页.按钮.恢复默认")}
        </Button>
      </div>

      <List
        className="settings-page-menu-list"
        dataSource={props.menuItems}
        renderItem={(item, index) => {
          const collapsed = collapsedKeySet.has(item.key);
          return (
            <List.Item
              data-settings-menu-key={item.key}
              className={[
                "settings-page-menu-list-item",
                draggingKey === item.key ? "is-dragging" : "",
                dropTarget?.key === item.key && dropTarget.position === "before" ? "is-drop-before" : "",
                dropTarget?.key === item.key && dropTarget.position === "after" ? "is-drop-after" : "",
              ].filter(Boolean).join(" ")}
            >
              <div className="settings-page-menu-row">
                <button type="button" className="settings-page-drag-handle" aria-label={props.t("设置页.按钮.拖动排序")} aria-grabbed={draggingKey === item.key} onPointerDown={(event) => handleSortPointerDown(event, item.key)} onClick={(event) => event.preventDefault()}>
                  <GripVertical size={16} />
                </button>

                <div className="settings-page-menu-copy">
                  <span className="settings-page-menu-name">{resolveRouteLabel(item, props.t)}</span>
                  <div className="settings-page-menu-description">
                    <span>{props.t("设置页.字段.菜单键")} {item.key}</span>
                    <span>{props.t("设置页.字段.当前位置")} {resolvePlacementText(collapsed)}</span>
                  </div>
                </div>

                <div className="settings-page-menu-action">
                  <span>{props.t("设置页.字段.收缩到更多")}</span>
                  <Switch checked={collapsed} checkedChildren={props.t("设置页.值.是")} unCheckedChildren={props.t("设置页.值.否")} onChange={(checked) => props.onMenuCollapsedChange(item.key, checked)} />
                  <Space size={2} className="settings-page-menu-order">
                    <Button type="text" size="small" aria-label={props.t("设置页.按钮.上移")} icon={<ArrowUp size={15} />} disabled={index === 0} onClick={() => props.onMoveMenuItem(item.key, "up")} />
                    <Button type="text" size="small" aria-label={props.t("设置页.按钮.下移")} icon={<ArrowDown size={15} />} disabled={index === props.menuItems.length - 1} onClick={() => props.onMoveMenuItem(item.key, "down")} />
                  </Space>
                </div>
              </div>
            </List.Item>
          );
        }}
      />
    </div>
  );
}