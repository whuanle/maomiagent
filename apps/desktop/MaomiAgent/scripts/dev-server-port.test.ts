import { afterEach, describe, expect, test } from "bun:test";

import {
  DEFAULT_DEV_SERVER_PORT,
  DEV_SERVER_PORT_ENV_NAME,
  resolveDevServerPort,
  resolveDevServerPortSource,
  selectDevServerPort,
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

  test("keeps the preferred port when it is available", async () => {
    const selected = await selectDevServerPort({
      preferredPort: 35123,
      source: "default",
    });

    expect(selected).toEqual({
      requestedPort: 35123,
      port: 35123,
      source: "default",
      didFallback: false,
    });
  });

  test("falls back to another port when the default port is occupied", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("busy");
      },
    });
    const occupiedPort = server.port;
    if (typeof occupiedPort !== "number") {
      throw new Error("Expected Bun test server to expose a port.");
    }

    try {
      const selected = await selectDevServerPort({
        preferredPort: occupiedPort,
        source: "default",
      });

      expect(selected.requestedPort).toBe(occupiedPort);
      expect(selected.port).not.toBe(occupiedPort);
      expect(selected.source).toBe("default");
      expect(selected.didFallback).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  test("throws when an explicitly configured port is occupied", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("busy");
      },
    });
    const occupiedPort = server.port;
    if (typeof occupiedPort !== "number") {
      throw new Error("Expected Bun test server to expose a port.");
    }

    try {
      await expect(selectDevServerPort({
        preferredPort: occupiedPort,
        source: "env",
      })).rejects.toThrow(`Port ${occupiedPort} from ${DEV_SERVER_PORT_ENV_NAME} is already in use.`);
    } finally {
      server.stop(true);
    }
  });
});
