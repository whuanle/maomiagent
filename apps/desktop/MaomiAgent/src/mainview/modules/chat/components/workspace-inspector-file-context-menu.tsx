import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DiffOutlined,
  FolderOpenOutlined,
  FolderViewOutlined,
} from "@ant-design/icons";
import { Dropdown, message as antMessage } from "antd";
import type { MenuProps } from "antd";
import type { ReactNode } from "react";

import type { DesktopGitChangeItem } from "../../../../shared/desktop-git";
import {
  stageDesktopGitChanges,
  unstageDesktopGitChanges,
} from "../../../lib/desktop-git";
import {
  hasDesktopWindowBridge,
  openDesktopPathInFileManager,
} from "../../../lib/desktop-window";
import type { LanguageCode } from "../../../config/titlebar";
import { openGitRouteWithReview } from "../../git/git-page-ui-state";
import {
  resolveWorkspaceInspectorFileManagerTargetPath,
  resolveWorkspaceInspectorGitActionState,
} from "./workspace-inspector-file-context-menu-model";

type Props = {
  language: LanguageCode;
  workspaceId?: string;
  path: string;
  absolutePath: string;
  nodeType?: "file" | "directory";
  isGitRepo?: boolean;
  gitChange?: DesktopGitChangeItem;
  onSelect?: (path: string) => void;
  onOpen?: (path: string) => void;
  onAfterGitMutation?: () => void | Promise<void>;
  children: ReactNode;
};

function getErrorText(value: unknown) {
  if (value instanceof Error && value.message) {
    return value.message;
  }

  return String(value ?? "");
}

async function writeClipboardText(value: string, successMessage: string, errorPrefix: string) {
  const writeText = globalThis.navigator?.clipboard?.writeText;
  if (typeof writeText !== "function") {
    antMessage.error(errorPrefix);
    return;
  }

  try {
    await writeText.call(globalThis.navigator.clipboard, value);
    antMessage.success(successMessage);
  } catch (error) {
    antMessage.error(`${errorPrefix}：${getErrorText(error)}`);
  }
}

export function WorkspaceInspectorFileContextMenu(props: Props) {
  const isEn = props.language === "en-US";
  const nodeType = props.nodeType ?? "file";
  const fileManagerTargetPath = resolveWorkspaceInspectorFileManagerTargetPath({
    absolutePath: props.absolutePath,
    nodeType,
  });
  const gitActionState = resolveWorkspaceInspectorGitActionState({
    change: props.gitChange,
    isGitRepo: props.isGitRepo,
    nodeType,
  });
  const canOpen = nodeType === "file" && typeof props.onOpen === "function";
  const canShowInFileManager = Boolean(fileManagerTargetPath) && hasDesktopWindowBridge();
  const showGitActions = nodeType === "file" && (props.isGitRepo === true || Boolean(props.gitChange));
  const openLocationLabel = nodeType === "directory"
    ? (isEn ? "Open Directory" : "打开目录")
    : (isEn ? "Open Containing Folder" : "打开所在目录");
  const menuItems: NonNullable<MenuProps["items"]> = [
    ...(nodeType === "file" ? [
      {
        key: "open",
        label: isEn ? "Open" : "打开",
        icon: <FolderOpenOutlined />,
        disabled: !canOpen,
      },
      {
        key: "open-to-side",
        label: isEn ? "Open to Side" : "侧边栏打开",
        icon: <FolderViewOutlined />,
        disabled: !canOpen,
      },
      { type: "divider" as const },
    ] : []),
    {
      key: "copy-relative-path",
      label: isEn ? "Copy Path" : "复制路径",
      icon: <CopyOutlined />,
    },
    {
      key: "copy-absolute-path",
      label: isEn ? "Copy Absolute Path" : "复制绝对路径",
      icon: <CopyOutlined />,
      disabled: !props.absolutePath,
    },
    {
      key: "show-in-file-manager",
      label: openLocationLabel,
      icon: <FolderOpenOutlined />,
      disabled: !canShowInFileManager,
    },
    ...(showGitActions ? [
      { type: "divider" as const },
      {
        key: "git-view-diff",
        label: isEn ? "Git: View Diff" : "Git：查看差异",
        icon: <DiffOutlined />,
        disabled: !gitActionState.canViewDiff || !props.workspaceId,
      },
      {
        key: "git-stage",
        label: isEn ? "Git: Stage Changes" : "Git：暂存更改",
        icon: <ArrowUpOutlined />,
        disabled: !gitActionState.canStage || !props.workspaceId,
      },
      {
        key: "git-unstage",
        label: isEn ? "Git: Unstage Changes" : "Git：取消暂存",
        icon: <ArrowDownOutlined />,
        disabled: !gitActionState.canUnstage || !props.workspaceId,
      },
    ] : []),
  ];

  async function runGitMutation(operation: () => Promise<{ message: string }>) {
    try {
      const result = await operation();
      if (result.message) {
        antMessage.success(result.message);
      }
      await props.onAfterGitMutation?.();
    } catch (error) {
      antMessage.error(isEn
        ? `Git action failed: ${getErrorText(error)}`
        : `Git 操作失败：${getErrorText(error)}`);
    }
  }

  async function handleMenuAction(key: string) {
    switch (key) {
      case "open":
      case "open-to-side":
        props.onSelect?.(props.path);
        props.onOpen?.(props.path);
        return;
      case "copy-relative-path":
        await writeClipboardText(
          props.path,
          isEn ? "Path copied" : "已复制路径",
          isEn ? "Unable to copy path" : "复制路径失败",
        );
        return;
      case "copy-absolute-path":
        await writeClipboardText(
          props.absolutePath,
          isEn ? "Absolute path copied" : "已复制绝对路径",
          isEn ? "Unable to copy absolute path" : "复制绝对路径失败",
        );
        return;
      case "show-in-file-manager":
        if (!fileManagerTargetPath) {
          return;
        }
        try {
          await openDesktopPathInFileManager(fileManagerTargetPath);
        } catch (error) {
          antMessage.error(isEn
            ? `Unable to open path: ${getErrorText(error)}`
            : `打开路径失败：${getErrorText(error)}`);
        }
        return;
      case "git-view-diff":
        if (!props.workspaceId) {
          return;
        }
        props.onSelect?.(props.path);
        openGitRouteWithReview({
          workspaceId: props.workspaceId,
          path: props.path,
        });
        return;
      case "git-stage":
        if (!props.workspaceId) {
          return;
        }
        await runGitMutation(() => stageDesktopGitChanges(props.workspaceId!, { paths: [props.path] }));
        return;
      case "git-unstage":
        if (!props.workspaceId) {
          return;
        }
        await runGitMutation(() => unstageDesktopGitChanges(props.workspaceId!, { paths: [props.path] }));
        return;
      default:
        return;
    }
  }

  return (
    <Dropdown
      trigger={["contextMenu"]}
      menu={{
        items: menuItems,
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          void handleMenuAction(String(key));
        },
      }}
    >
      <div
        className="chat-inspector-tree-context-trigger"
        data-allow-context-menu
        onContextMenu={() => {
          if (nodeType === "file") {
            props.onSelect?.(props.path);
          }
        }}
      >
        {props.children}
      </div>
    </Dropdown>
  );
}
