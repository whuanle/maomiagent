export const RUNTIME_PACKAGE_LAYOUTS = [
  {
    target: { os: "win", arch: "x64" },
    packageName: "maomiagent-runtime-win-x64",
    packageDirectoryName: "maomiagent-runtime-win-x64",
    bundleName: "win-x64.zip",
    os: ["win32"],
    cpu: ["x64"],
  },
  {
    target: { os: "linux", arch: "x64" },
    packageName: "maomiagent-runtime-linux-x64",
    packageDirectoryName: "maomiagent-runtime-linux-x64",
    bundleName: "linux-x64.zip",
    os: ["linux"],
    cpu: ["x64"],
  },
  {
    target: { os: "macos", arch: "arm64" },
    packageName: "maomiagent-runtime-macos-arm64",
    packageDirectoryName: "maomiagent-runtime-macos-arm64",
    bundleName: "macos-arm64-app.zip",
    os: ["darwin"],
    cpu: ["arm64"],
  },
  {
    target: { os: "macos", arch: "x64" },
    packageName: "maomiagent-runtime-macos-x64",
    packageDirectoryName: "maomiagent-runtime-macos-x64",
    bundleName: "macos-x64-app.zip",
    os: ["darwin"],
    cpu: ["x64"],
  },
];

export function resolveRuntimeTargetKey(target) {
  return `${target.os}-${target.arch}`;
}

export function resolveRuntimePackageLayout(target) {
  const targetKey = resolveRuntimeTargetKey(target);

  return RUNTIME_PACKAGE_LAYOUTS.find(
    (layout) => resolveRuntimeTargetKey(layout.target) === targetKey,
  );
}
