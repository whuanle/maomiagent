import path from "node:path";

export function resolveTargetPlatform(platform = process.platform, arch = process.arch) {
  if (platform === "win32" && arch === "x64") {
    return { os: "win", arch: "x64" };
  }

  if (platform === "linux" && arch === "x64") {
    return { os: "linux", arch: "x64" };
  }

  if (platform === "darwin" && arch === "arm64") {
    return { os: "macos", arch: "arm64" };
  }

  if (platform === "darwin" && arch === "x64") {
    return { os: "macos", arch: "x64" };
  }

  throw new Error(`Unsupported MaomiAgent target: ${platform}/${arch}`);
}

export function resolveRuntimeBundleName(target) {
  if (target.os === "macos") {
    return `macos-${target.arch}-app.zip`;
  }

  return `${target.os}-${target.arch}.zip`;
}

export function resolveLaunchPath(runtimeRoot, target) {
  if (target.os === "win") {
    return path.join(runtimeRoot, "MaomiAgent", "bin", "launcher.exe");
  }

  if (target.os === "linux") {
    return path.join(runtimeRoot, "MaomiAgent", "bin", "launcher");
  }

  if (target.os === "macos") {
    return path.join(runtimeRoot, "MaomiAgent.app");
  }

  throw new Error(`Unsupported MaomiAgent target OS: ${target.os}`);
}
