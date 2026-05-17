import { normalizeText } from "./release-common";

export type ReleaseEndpointEnvironment = Record<string, string | undefined>;

export type ReleaseEndpoints = {
  adminBaseUrl: string;
  publicBaseUrl: string;
  uploadRequestUrl: string;
  uploadCompleteUrl: string;
  adminReleasesUrl: string;
  autoPublish: boolean;
};

const DEFAULT_RELEASE_ADMIN_BASE_URL = "https://release-admin.example.com";
const DEFAULT_PUBLIC_SOFTWARE_BASE_URL = "https://downloads.example.com/maomiagent/public";

export function resolveReleaseEndpoints(
  env: ReleaseEndpointEnvironment = process.env,
): ReleaseEndpoints {
  const adminBaseUrl = normalizeUrl(env.MAOMI_RELEASE_ADMIN_BASE_URL) || DEFAULT_RELEASE_ADMIN_BASE_URL;
  const publicBaseUrl = normalizeUrl(env.MAOMI_DESKTOP_PUBLIC_SOFTWARE_BASE_URL) || DEFAULT_PUBLIC_SOFTWARE_BASE_URL;

  return {
    adminBaseUrl,
    publicBaseUrl,
    uploadRequestUrl: normalizeUrl(env.MAOMI_RELEASE_UPLOAD_REQUEST_URL)
      || joinUrl(adminBaseUrl, "admin", "software", "publish", "assets", "pre-upload"),
    uploadCompleteUrl: normalizeUrl(env.MAOMI_RELEASE_UPLOAD_COMPLETE_URL)
      || joinUrl(adminBaseUrl, "admin", "software", "publish", "assets"),
    adminReleasesUrl: normalizeUrl(env.MAOMI_RELEASE_ADMIN_RELEASES_URL)
      || joinUrl(adminBaseUrl, "admin", "software", "releases"),
    autoPublish: readBooleanEnv(env.MAOMI_RELEASE_AUTO_PUBLISH),
  };
}

function normalizeUrl(value: string | undefined): string {
  return normalizeText(value).replace(/\/+$/u, "");
}

function joinUrl(base: string, ...segments: string[]): string {
  const normalizedBase = normalizeUrl(base);
  const normalizedSegments = segments
    .map((segment) => normalizeText(segment).replace(/^\/+|\/+$/gu, ""))
    .filter(Boolean);
  return [normalizedBase, ...normalizedSegments].join("/");
}

function readBooleanEnv(value: string | undefined): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}