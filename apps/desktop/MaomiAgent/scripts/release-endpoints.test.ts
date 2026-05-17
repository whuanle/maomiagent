import { describe, expect, test } from "bun:test";

import { resolveReleaseEndpoints } from "./release-endpoints";

describe("resolveReleaseEndpoints", () => {
  test("uses repository-safe defaults and keeps release publishing disabled by default", () => {
    expect(resolveReleaseEndpoints({})).toEqual({
      adminBaseUrl: "https://release-admin.example.com",
      publicBaseUrl: "https://downloads.example.com/maomiagent/public",
      uploadRequestUrl: "https://release-admin.example.com/admin/software/publish/assets/pre-upload",
      uploadCompleteUrl: "https://release-admin.example.com/admin/software/publish/assets",
      adminReleasesUrl: "https://release-admin.example.com/admin/software/releases",
      autoPublish: false,
    });
  });

  test("derives admin endpoints from the configured base url and only enables publish when requested", () => {
    expect(resolveReleaseEndpoints({
      MAOMI_RELEASE_ADMIN_BASE_URL: " https://admin.example.com/ ",
      MAOMI_DESKTOP_PUBLIC_SOFTWARE_BASE_URL: " https://front.example.com/software/public/ ",
      MAOMI_RELEASE_AUTO_PUBLISH: "true",
    })).toEqual({
      adminBaseUrl: "https://admin.example.com",
      publicBaseUrl: "https://front.example.com/software/public",
      uploadRequestUrl: "https://admin.example.com/admin/software/publish/assets/pre-upload",
      uploadCompleteUrl: "https://admin.example.com/admin/software/publish/assets",
      adminReleasesUrl: "https://admin.example.com/admin/software/releases",
      autoPublish: true,
    });
  });

  test("prefers explicit endpoint overrides when provided", () => {
    expect(resolveReleaseEndpoints({
      MAOMI_RELEASE_ADMIN_BASE_URL: " https://admin.example.com/root/ ",
      MAOMI_DESKTOP_PUBLIC_SOFTWARE_BASE_URL: " https://front.example.com/software/public/ ",
      MAOMI_RELEASE_UPLOAD_REQUEST_URL: " https://override.example.com/pre-upload/ ",
      MAOMI_RELEASE_UPLOAD_COMPLETE_URL: " https://override.example.com/assets/{assetId}/complete/ ",
      MAOMI_RELEASE_ADMIN_RELEASES_URL: " https://override.example.com/releases/ ",
    })).toEqual({
      adminBaseUrl: "https://admin.example.com/root",
      publicBaseUrl: "https://front.example.com/software/public",
      uploadRequestUrl: "https://override.example.com/pre-upload",
      uploadCompleteUrl: "https://override.example.com/assets/{assetId}/complete",
      adminReleasesUrl: "https://override.example.com/releases",
      autoPublish: false,
    });
  });
});