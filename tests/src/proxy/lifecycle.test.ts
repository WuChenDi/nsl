import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  allocPort,
  createStateDir,
  cleanupStateDir,
  nsl,
  startProxy,
  stopProxy,
} from "../helpers";

describe("proxy lifecycle", () => {
  let stateDir: string;
  let port: number;

  beforeAll(() => {
    stateDir = createStateDir();
    port = allocPort();
  });

  afterAll(async () => {
    await stopProxy();
    cleanupStateDir(stateDir);
  });

  test("proxy starts and accepts TCP connections", async () => {
    await startProxy(stateDir, port);

    // Verify it responds to HTTP
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { Host: "nonexistent.localhost" },
    });
    // Should get a 404 (no route) rather than a connection error
    expect(res.status).toBe(404);
    expect(res.headers.get("x-nsl")).toBe("1");
  });

  test("status command shows running proxy", async () => {
    const result = await nsl(["status"], stateDir, port);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("running");
  });

  test("list command works with no routes", async () => {
    const result = await nsl(["list"], stateDir, port);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No active routes");
  });

  test("proxy stops cleanly", async () => {
    await stopProxy();

    // Verify it is no longer accepting connections
    let refused = false;
    try {
      await fetch(`http://127.0.0.1:${port}/`);
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });
});
