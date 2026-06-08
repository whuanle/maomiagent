import { afterEach, describe, expect, test } from "bun:test";

import {
  DEFAULT_DEV_SERVER_PORT,
  DEV_SERVER_PORT_ENV_NAME,
  resolveDevServerPort,
  resolveDevServerPortSource,
} from "./dev-server-port";

const originalDevServerPort = process.env[DEV_SERVER_PORT_ENV_NAME];

describe("dev server port", () => {
  afterEach(() => {
    if (typeof originalDevServerPort === "string") {
      process.env[DEV_SERVER_PORT_ENV_NAME] = originalDevServerPort;
      return;
    }

    delete process.env[DEV_SERVER_PORT_ENV_NAME];
  });

  test("defaults to the fixed desktop dev server port", () => {
    delete process.env[DEV_SERVER_PORT_ENV_NAME];

    expect(resolveDevServerPort()).toBe(DEFAULT_DEV_SERVER_PORT);
    expect(DEFAULT_DEV_SERVER_PORT).toBe(35001);
    expect(resolveDevServerPortSource()).toBe("default");
  });

  test("reads the desktop dev server port override from the environment", () => {
    process.env[DEV_SERVER_PORT_ENV_NAME] = "35123";

    expect(resolveDevServerPort()).toBe(35123);
    expect(resolveDevServerPortSource()).toBe("env");
  });

  test("falls back to the fixed default when the override is invalid", () => {
    process.env[DEV_SERVER_PORT_ENV_NAME] = "invalid";

    expect(resolveDevServerPort()).toBe(DEFAULT_DEV_SERVER_PORT);
    expect(resolveDevServerPortSource()).toBe("default");
  });
});
