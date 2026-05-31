import type { ElectrobunConfig } from "electrobun";

const resolvedBuildFolder =
  process.env.MAOMI_DESKTOP_DEV_BUILD_FOLDER?.trim() || "build";
const resolvedArtifactFolder =
  process.env.MAOMI_DESKTOP_ARTIFACT_FOLDER?.trim() || "artifacts";
const resolvedDesktopVersion =
  process.env.MAOMI_DESKTOP_VERSION?.trim() || "0.1.0";
const shouldGeneratePatch = process.env.MAOMI_DESKTOP_GENERATE_PATCH?.trim() === "true";

export default {
  app: {
    name: "MaomiAgent",
    identifier: "com.maomiagent.desktop",
    version: resolvedDesktopVersion,
    description: "MaomiAgent Electrobun desktop shell",
  },
  build: {
    buildFolder: resolvedBuildFolder,
    artifactFolder: resolvedArtifactFolder,
    views: {},
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      "dist/branding": "views/mainview/branding",
      ".generated/update-config.json": "update-config.json",
    },
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: false,
      icon: "src/mainview/public/branding/generated/icon-512.png",
    },
    win: {
      bundleCEF: false,
      icon: "src/mainview/public/branding/generated/icon-512.ico",
    },
  },
  release: {
    baseUrl: "",
    generatePatch: shouldGeneratePatch,
  },
} satisfies ElectrobunConfig;
