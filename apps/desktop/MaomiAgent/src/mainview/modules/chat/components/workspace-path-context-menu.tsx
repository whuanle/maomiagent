import {
  CopyOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { Dropdown, message as antMessage } from "antd";
import type { MenuProps } from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { getDesktopWorkspace } from "../../../lib/desktop-workspace";
import {
  hasDesktopWindowBridge,
  openDesktopPathInFileManager,
} from "../../../lib/desktop-window";
import type { LanguageCode } from "../../../config/titlebar";
import {
  resolveWorkspaceAbsolutePath,
  resolveWorkspaceFileContainingDirectory,
} from "./workspace-file-location";

type WorkspacePathKind = "file" | "directory" | "unknown";

type Props = {
  language: LanguageCode;
  workspaceId?: string;
  path: string;
  absolutePath?: string;
  pathKind?: WorkspacePathKind;
  children: ReactNode;
};

const workspaceDirectoryPathCache = new Map<string, string>();

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

function useWorkspaceDirectoryPath(workspaceId?: string) {
  const normalizedWorkspaceId = workspaceId?.trim() || "";
  const [directoryPath, setDirectoryPath] = useState(() => (
    normalizedWorkspaceId ? (workspaceDirectoryPathCache.get(normalizedWorkspaceId) ?? "") : ""
  ));

  useEffect(() => {
    if (!normalizedWorkspaceId) {
      setDirectoryPath("");
      return;
    }

    const cachedDirectoryPath = workspaceDirectoryPathCache.get(normalizedWorkspaceId);
    if (cachedDirectoryPath !== undefined) {
      setDirectoryPath(cachedDirectoryPath);
      return;
    }

    let active = true;
    void getDesktopWorkspace(normalizedWorkspaceId)
      .then((workspace) => {
        if (!active) {
          return;
        }

        const nextDirectoryPath = workspace?.directoryPath?.trim() || "";
        if (nextDirectoryPath) {
          workspaceDirectoryPathCache.set(normalizedWorkspaceId, nextDirectoryPath);
        }
        setDirectoryPath(nextDirectoryPath);
      })
      .catch(() => {
        if (active) {
          setDirectoryPath("");
        }
      });

    return () => {
      active = false;
    };
  }, [normalizedWorkspaceId]);

  return directoryPath;
}

export function WorkspacePathContextMenu(props: Props) {
  const isEn = props.language === "en-US";
  const pathKind = props.pathKind ?? "unknown";
  const workspaceDirectoryPath = useWorkspaceDirectoryPath(props.workspaceId);
  const relativePath = props.path.trim();
  const absolutePath = useMemo(() => (
    props.absolutePath?.trim()
      || resolveWorkspaceAbsolutePath({
        path: relativePath,
        rootPath: workspaceDirectoryPath,
      })
  ), [props.absolutePath, relativePath, workspaceDirectoryPath]);
  const fileManagerPath = useMemo(() => {
    if (!absolutePath) {
      return "";
    }

    if (pathKind === "directory") {
      return absolutePath;
    }

    if (pathKind === "file") {
      return resolveWorkspaceFileContainingDirectory({
        absolutePath,
        fallbackPath: workspaceDirectoryPath,
      });
    }

    return absolutePath;
  }, [absolutePath, pathKind, workspaceDirectoryPath]);
  const canOpenInFileManager = Boolean(fileManagerPath) && hasDesktopWindowBridge();
  const showAbsolutePathAction = Boolean(absolutePath && absolutePath !== relativePath);
  const openPathLabel = pathKind === "directory"
    ? (isEn ? "Open Directory" : "打开目录")
    : pathKind === "file"
      ? (isEn ? "Open Containing Folder" : "打开所在目录")
      : (isEn ? "Open Path" : "打开路径");
  const menuItems: NonNullable<MenuProps["items"]> = [
    {
      key: "copy-path",
      label: isEn ? "Copy Path" : "复制路径",
      icon: <CopyOutlined />,
      disabled: !relativePath,
    },
    ...(showAbsolutePathAction ? [{
      key: "copy-absolute-path",
      label: isEn ? "Copy Absolute Path" : "复制绝对路径",
      icon: <CopyOutlined />,
    }] : []),
    {
      key: "open-in-file-manager",
      label: openPathLabel,
      icon: <FolderOpenOutlined />,
      disabled: !canOpenInFileManager,
    },
  ];

  async function handleMenuAction(key: string) {
    switch (key) {
      case "copy-path":
        await writeClipboardText(
          relativePath,
          isEn ? "Path copied" : "已复制路径",
          isEn ? "Unable to copy path" : "复制路径失败",
        );
        return;
      case "copy-absolute-path":
        if (!absolutePath) {
          return;
        }
        await writeClipboardText(
          absolutePath,
          isEn ? "Absolute path copied" : "已复制绝对路径",
          isEn ? "Unable to copy absolute path" : "复制绝对路径失败",
        );
        return;
      case "open-in-file-manager":
        if (!fileManagerPath) {
          return;
        }
        try {
          await openDesktopPathInFileManager(fileManagerPath);
        } catch (error) {
          antMessage.error(isEn
            ? `Unable to open path: ${getErrorText(error)}`
            : `打开路径失败：${getErrorText(error)}`);
        }
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
      <div className="chat-inspector-tree-context-trigger" data-allow-context-menu>
        {props.children}
      </div>
    </Dropdown>
  );
}
