import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  allocPort,
  createStateDir,
  cleanupStateDir,
  nsl,
  startProxy,
  stopProxy,
  startWsUpstream,
  type WsUpstream,
} from "../helpers";

describe("WebSocket proxy", () => {
  let stateDir: string;
  let proxyPort: number;
  let wsUpstream: WsUpstream;

  beforeAll(async () => {
    stateDir = createStateDir();
    proxyPort = allocPort();
    wsUpstream = startWsUpstream();
    await startProxy(stateDir, proxyPort);
    await nsl(
      ["route", "wsapp", String(wsUpstream.port), "--force"],
      stateDir,
      proxyPort,
    );
    await Bun.sleep(2500);
  });

  afterAll(async () => {
    await stopProxy();
    wsUpstream.stop();
    cleanupStateDir(stateDir);
  });

  test("WebSocket connection through proxy works", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${proxyPort}/ws`, {
      headers: { Host: "wsapp.localhost" },
    });

    const messages: string[] = [];
    const opened = new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", (e) => reject(new Error(`ws error: ${e}`)));
      setTimeout(() => reject(new Error("ws open timeout")), 5000);
    });

    ws.addEventListener("message", (e) => {
      messages.push(typeof e.data === "string" ? e.data : "");
    });

    await opened;

    ws.send("hello");
    ws.send("world");

    // Wait for echo responses
    const deadline = Date.now() + 5000;
    while (messages.length < 2 && Date.now() < deadline) {
      await Bun.sleep(100);
    }

    ws.close();

    expect(messages).toContain("echo:hello");
    expect(messages).toContain("echo:world");
    expect(wsUpstream.received).toContain("hello");
    expect(wsUpstream.received).toContain("world");
  });
});
