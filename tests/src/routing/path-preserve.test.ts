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

describe("path preserved by default (no --strip)", () => {
  let stateDir: string;
  let proxyPort: number;
  let upstream: UpstreamServer;

  beforeAll(async () => {
    stateDir = createStateDir();
    proxyPort = allocPort();

    upstream = startUpstream((req) => {
      return new Response(JSON.stringify({
        path: new URL(req.url).pathname,
      }), { headers: { "Content-Type": "application/json" } });
    });

    await startProxy(stateDir, proxyPort);

    // Register /api prefix WITHOUT --strip
    await nsl(
      [
        "route", "preserve:/api", String(upstream.port),
        "--force",
      ],
      stateDir,
      proxyPort,
    );

    await Bun.sleep(2500);
  });

  afterAll(async () => {
    await stopProxy();
    upstream.stop();
    cleanupStateDir(stateDir);
  });

  test("/api/users forwards as /api/users (prefix preserved)", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/users`, {
      headers: { Host: "preserve.localhost" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe("/api/users");
  });

  test("/api exact forwards as /api (prefix preserved)", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api`, {
      headers: { Host: "preserve.localhost" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe("/api");
  });
});
