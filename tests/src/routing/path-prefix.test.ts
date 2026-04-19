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

describe("path prefix routing", () => {
  let stateDir: string;
  let proxyPort: number;
  let apiUpstream: UpstreamServer;
  let webUpstream: UpstreamServer;

  beforeAll(async () => {
    stateDir = createStateDir();
    proxyPort = allocPort();

    apiUpstream = startUpstream((req) => {
      return new Response(JSON.stringify({
        service: "api",
        path: new URL(req.url).pathname,
      }), { headers: { "Content-Type": "application/json" } });
    });

    webUpstream = startUpstream((req) => {
      return new Response(JSON.stringify({
        service: "web",
        path: new URL(req.url).pathname,
      }), { headers: { "Content-Type": "application/json" } });
    });

    await startProxy(stateDir, proxyPort);

    // Register /api -> apiUpstream with strip
    await nsl(
      [
        "route", "multi:/api", String(apiUpstream.port),
        "--force", "--strip",
      ],
      stateDir,
      proxyPort,
    );

    // Register / -> webUpstream (catch-all)
    await nsl(
      ["route", "multi", String(webUpstream.port), "--force"],
      stateDir,
      proxyPort,
    );

    await Bun.sleep(2500);
  });

  afterAll(async () => {
    await stopProxy();
    apiUpstream.stop();
    webUpstream.stop();
    cleanupStateDir(stateDir);
  });

  test("/api/users routes to api upstream", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/users`, {
      headers: { Host: "multi.localhost" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("api");
  });

  test("strip removes /api from forwarded path", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/users`, {
      headers: { Host: "multi.localhost" },
    });
    const body = await res.json();
    expect(body.path).toBe("/users");
  });

  test("/ routes to web upstream", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/about`, {
      headers: { Host: "multi.localhost" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("web");
    expect(body.path).toBe("/about");
  });

  test("/api exact path routes to api upstream", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api`, {
      headers: { Host: "multi.localhost" },
    });
    const body = await res.json();
    expect(body.service).toBe("api");
    expect(body.path).toBe("/");
  });
});
