import {
  CodeOutlined,
  FileImageOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderFilled,
  FolderOpenFilled,
} from "@ant-design/icons";
import type { ReactNode } from "react";

type Props = {
  path: string;
  className?: string;
  isDirectory?: boolean;
  expanded?: boolean;
};

function normalizeFileExtension(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").filter(Boolean).pop() ?? normalized;
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function resolveFileIcon(path: string): ReactNode {
  const extension = normalizeFileExtension(path);

  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(extension)) {
    return <FileImageOutlined />;
  }

  if (["ts", "tsx", "js", "jsx", "json", "css", "scss", "less", "md", "yml", "yaml", "xml", "html"].includes(extension)) {
    return <CodeOutlined />;
  }

  if (["txt", "log", "env"].includes(extension)) {
    return <FileTextOutlined />;
  }

  return <FileOutlined />;
}

export function WorkspaceFileIcon(props: Props) {
  return (
    <span className={props.className} aria-hidden="true">
      {props.isDirectory
        ? props.expanded
          ? <FolderOpenFilled />
          : <FolderFilled />
        : resolveFileIcon(props.path)}
    </span>
  );
}