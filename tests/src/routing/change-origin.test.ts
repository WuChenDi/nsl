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

describe("change_origin header rewriting", () => {
  let stateDir: string;
  let proxyPort: number;
  let upstream: UpstreamServer;

  beforeAll(async () => {
    stateDir = createStateDir();
    proxyPort = allocPort();
    upstream = startUpstream();
    await startProxy(stateDir, proxyPort);

    await nsl(
      [
        "route", "originapp", String(upstream.port),
        "--force", "--change-origin",
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

  test("Host header is rewritten to 127.0.0.1:<port>", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/`, {
      headers: { Host: "originapp.localhost" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.headers["host"]).toBe(`127.0.0.1:${upstream.port}`);
  });

  test("x-forwarded-host still contains original hostname", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/`, {
      headers: { Host: "originapp.localhost" },
    });
    const body = await res.json();
    expect(body.headers["x-forwarded-host"]).toBe("originapp.localhost");
  });
});
