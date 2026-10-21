// the obs bridge speaks obs-websocket 5.x. this test runs a mock obs server
// in-process (hello -> identify -> identified, then request/response) and
// drives the bridge against it, so the protocol, the auth math, the item-id
// resolution and the failure path are all exercised without a live obs.
//
//   deno test --allow-env --allow-net tests/obs_test.ts

import { ObsBridge, obsAuthHash } from "../integrations/obs.ts";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";

const PASSWORD = "obs-pass";
const SALT = "c2FsdA==";
const CHALLENGE = "Y2hhbGxlbmdl";

interface ObsServer {
  url: string;
  requests: { requestType: string; requestData?: Record<string, unknown> }[];
  finish: () => Promise<void>;
}

// exported for integrations_test.ts: the mock speaks the real protocol, so
// the target tests ride the same bridge the bridge tests do.
export function mockObs(opts: { auth?: boolean } = {}): ObsServer {
  const requests: ObsServer["requests"] = [];
  const sockets: WebSocket[] = [];
  const controller = new AbortController();
  const server = Deno.serve({ signal: controller.signal, port: 0 }, (req) => {
    const { socket, response } = Deno.upgradeWebSocket(req);
    sockets.push(socket);
    socket.onopen = () => {
      socket.send(JSON.stringify({
        op: 0,
        d: {
          rpcVersion: 1,
          ...(opts.auth ? { authentication: { challenge: CHALLENGE, salt: SALT } } : {}),
        },
      }));
    };
    socket.onmessage = async (ev) => {
      const env = JSON.parse(ev.data as string);
      if (env.op === 1) {
        // the bridge must pass obs's challenge/response, verbatim.
        if (opts.auth) {
          const expected = await obsAuthHash(PASSWORD, CHALLENGE, SALT);
          assertEquals(env.d.authentication, expected, "identify must carry the obs auth hash");
        }
        socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        return;
      }
      if (env.op === 6) {
        const { requestType, requestId, requestData } = env.d;
        requests.push({ requestType, requestData });
        const ok = requestType !== "Explode";
        socket.send(JSON.stringify({
          op: 7,
          d: {
            requestType,
            requestId,
            requestStatus: ok ? { ok: true } : { ok: false, comment: "no such request" },
            ...(requestType === "GetSceneList"
              ? { responseData: { scenes: [{ sceneName: "live" }, { sceneName: "idle" }] } }
              : requestType === "GetSceneItemList"
              ? { responseData: { sceneItems: [{ sceneItemId: 7, sourceName: "prixie cam" }] } }
              : requestType === "GetStreamStatus"
              ? { responseData: { outputActive: true } }
              : { responseData: {} }),
          },
        }));
      }
    };
    return response;
  });
  return {
    url: `ws://127.0.0.1:${(server.addr as Deno.NetAddr).port}`,
    requests,
    finish: async () => {
      for (const s of sockets) s.close();
      controller.abort();
      await server.finished;
    },
  };
}

Deno.test("the bridge handshakes with obs's challenge/response", async () => {
  const obs = mockObs({ auth: true });
  const bridge = new ObsBridge({ url: obs.url, password: PASSWORD });
  await bridge.connect();
  assertEquals(bridge.connected, true);
  const scenes = await bridge.scenes();
  assertEquals(scenes, ["live", "idle"]);
  bridge.close();
  await obs.finish();
});

Deno.test("no password configured, obs wants one: the bridge refuses to guess", async () => {
  const obs = mockObs({ auth: true });
  const bridge = new ObsBridge({ url: obs.url });
  await assertRejects(() => bridge.connect(), Error, "password");
  bridge.close();
  await obs.finish();
});

Deno.test("hiding the camera source resolves the item id first", async () => {
  const obs = mockObs();
  const bridge = new ObsBridge({ url: obs.url });
  await bridge.connect();
  await bridge.setSourceVisible("live", "prixie cam", false);
  const types = obs.requests.map((r) => r.requestType);
  assertEquals(types.indexOf("GetSceneItemList") < types.indexOf("SetSceneItemEnabled"), true,
    "the id must be resolved before the item is touched");
  const hide = obs.requests.find((r) => r.requestType === "SetSceneItemEnabled");
  assertEquals(hide?.requestData, {
    sceneName: "live",
    sceneItemId: 7,
    sceneItemEnabled: false,
  });
  // the id is cached: a second hide does not re-resolve it.
  obs.requests.length = 0;
  await bridge.setSourceVisible("live", "prixie cam", false);
  assertEquals(
    obs.requests.some((r) => r.requestType === "GetSceneItemList"),
    false,
    "item id is cached after first resolve",
  );
  bridge.close();
  await obs.finish();
});

Deno.test("stream control, platform-agnostic", async () => {
  const obs = mockObs();
  const bridge = new ObsBridge({ url: obs.url });
  await bridge.connect();
  await bridge.startStream();
  assertEquals(await bridge.isStreaming(), true);
  assertEquals(
    obs.requests.find((r) => r.requestType === "SetStreamActive")?.requestData,
    { streamActive: true },
  );
  bridge.close();
  await obs.finish();
});

Deno.test("a failed obs request surfaces the server's comment", async () => {
  const obs = mockObs();
  const bridge = new ObsBridge({ url: obs.url });
  await bridge.connect();
  await assertRejects(() => bridge.request("Explode"), Error, "no such request");
  bridge.close();
  await obs.finish();
});
