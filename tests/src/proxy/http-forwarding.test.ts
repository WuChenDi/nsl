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

describe("HTTP proxy forwarding", () => {
  let stateDir: string;
  let proxyPort: number;
  let upstream: UpstreamServer;

  beforeAll(async () => {
    stateDir = createStateDir();
    proxyPort = allocPort();
    upstream = startUpstream();
    await startProxy(stateDir, proxyPort);
    await nsl(
      ["route", "httptest", String(upstream.port), "--force"],
      stateDir,
      proxyPort,
    );
    // Wait for route cache to pick up the new route
    await Bun.sleep(2500);
  });

  afterAll(async () => {
    await stopProxy();
    upstream.stop();
    cleanupStateDir(stateDir);
  });

  test("GET request forwarded with correct path", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/users?page=1`, {
      headers: { Host: "httptest.localhost" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("/api/users?page=1");
    expect(body.method).toBe("GET");
  });

  test("POST request forwarded with body", async () => {
    const payload = JSON.stringify({ name: "test" });
    const res = await fetch(`http://127.0.0.1:${proxyPort}/submit`, {
      method: "POST",
      headers: {
        Host: "httptest.localhost",
        "Content-Type": "application/json",
      },
      body: payload,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.method).toBe("POST");
    expect(body.body).toBe(payload);
  });

  test("x-forwarded-for header is set", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/headers`, {
      headers: { Host: "httptest.localhost" },
    });
    const body = await res.json();
    expect(body.headers["x-forwarded-for"]).toContain("127.0.0.1");
  });

  test("x-forwarded-proto header is set", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/headers`, {
      headers: { Host: "httptest.localhost" },
    });
    const body = await res.json();
    expect(body.headers["x-forwarded-proto"]).toBe("http");
  });

  test("x-forwarded-host header is set", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/headers`, {
      headers: { Host: "httptest.localhost" },
    });
    const body = await res.json();
    expect(body.headers["x-forwarded-host"]).toBe("httptest.localhost");
  });

  test("x-nsl response header is present", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/`, {
      headers: { Host: "httptest.localhost" },
    });
    expect(res.headers.get("x-nsl")).toBe("1");
  });

  test("custom request headers are forwarded", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/`, {
      headers: {
        Host: "httptest.localhost",
        "X-Custom-Header": "test-value-123",
      },
    });
    const body = await res.json();
    expect(body.headers["x-custom-header"]).toBe("test-value-123");
  });
});
