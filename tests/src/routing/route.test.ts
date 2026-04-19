import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  allocPort,
  createStateDir,
  cleanupStateDir,
  nsl,
  startProxy,
  stopProxy,
  startUpstream,
  type UpstreamServer,
} from "../helpers";

describe("route add/remove/list", () => {
  let stateDir: string;
  let proxyPort: number;
  let upstream: UpstreamServer;

  beforeAll(async () => {
    stateDir = createStateDir();
    proxyPort = allocPort();
    upstream = startUpstream();
    await startProxy(stateDir, proxyPort);
  });

  afterAll(async () => {
    await stopProxy();
    upstream.stop();
    cleanupStateDir(stateDir);
  });

  test("route add registers a route", async () => {
    const result = await nsl(
      ["route", "myapp", String(upstream.port), "--force"],
      stateDir,
      proxyPort,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("myapp.localhost");
    // Wait for proxy route cache to pick up the new route
    await Bun.sleep(2500);
  });

  test("list shows the registered route", async () => {
    const result = await nsl(["list"], stateDir, proxyPort);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("myapp.localhost");
    expect(result.stdout).toContain(String(upstream.port));
  });

  test("get returns the URL for a route", async () => {
    const result = await nsl(["get", "myapp"], stateDir, proxyPort);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("myapp.localhost");
  });

  test("proxy routes traffic through registered route", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/hello`, {
      headers: { Host: "myapp.localhost" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("/hello");
    expect(body.method).toBe("GET");
  });

  test("route --remove unregisters the route", async () => {
    const result = await nsl(
      ["route", "myapp", "--remove"],
      stateDir,
      proxyPort,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("removed");
  });

  test("removed route returns 404", async () => {
    // Wait a bit for route cache to refresh
    await Bun.sleep(3000);
    const res = await fetch(`http://127.0.0.1:${proxyPort}/hello`, {
      headers: { Host: "myapp.localhost" },
    });
    expect(res.status).toBe(404);
  });
});
