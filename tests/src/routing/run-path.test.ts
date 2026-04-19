import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type Subprocess } from "bun";
import {
  allocPort,
  createStateDir,
  cleanupStateDir,
  nslEnv,
  startProxy,
  stopProxy,
  startUpstream,
  type UpstreamServer,
} from "../helpers";

const NSL_BIN = process.env.NSL_BIN ?? "nsl";

/**
 * Spawn `nsl run --name <host:/path> [--strip]`. The "command" is just a sleep
 * that stays alive — the upstream server is already running on `appPort`. We
 * use `--port` so nsl registers the already-listening upstream, and
 * `sleep` as the child so nsl holds the route for the duration of the test.
 */
function spawnNslRun(
  nameWithPath: string,
  appPort: number,
  strip: boolean,
  stateDir: string,
  proxyPort: number,
): Subprocess {
  const args = [
    "run",
    "--name", nameWithPath,
    "--port", String(appPort),
    "--force",
  ];
  if (strip) args.push("--strip");
  args.push("--", "sleep", "60");

  return spawn([NSL_BIN, ...args], {
    env: nslEnv(stateDir, proxyPort),
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("run with name path routes different URLs on same hostname", () => {
  let stateDir: string;
  let proxyPort: number;
  let apiUpstream: UpstreamServer;
  let webUpstream: UpstreamServer;
  let apiProc: Subprocess | null = null;
  let webProc: Subprocess | null = null;

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

    apiProc = spawnNslRun(
      "multi-run:/api",
      apiUpstream.port,
      true,
      stateDir,
      proxyPort,
    );
    webProc = spawnNslRun(
      "multi-run",
      webUpstream.port,
      false,
      stateDir,
      proxyPort,
    );

    await Bun.sleep(3500);
  });

  afterAll(async () => {
    apiProc?.kill("SIGTERM");
    webProc?.kill("SIGTERM");
    if (apiProc) await apiProc.exited;
    if (webProc) await webProc.exited;
    await stopProxy();
    apiUpstream.stop();
    webUpstream.stop();
    cleanupStateDir(stateDir);
  });

  test("/api/users routes to api upstream with prefix stripped", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/users`, {
      headers: { Host: "multi-run.localhost" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("api");
    expect(body.path).toBe("/users");
  });

  test("/about routes to web upstream (catch-all)", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/about`, {
      headers: { Host: "multi-run.localhost" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("web");
    expect(body.path).toBe("/about");
  });
});
