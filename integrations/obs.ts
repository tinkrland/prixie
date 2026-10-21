// the obs bridge: ours, not masky's.
//
// masky ships a native twitch/OBS integration, but "the platform owns the
// bridge" is the same trap as "the model owns the room": a streamer's setup is
// a set of scenes they control. so this branch bridges to obs studio itself,
// over obs-websocket 5.x. what that buys:
//
// - the composite mp4 is one obs source (a media source or vlc), proskena's
//   canvas can be another, and scene switches are ours to trigger;
// - the camera-off handoff (handoff.ts) hides the masky camera source at the
//   browser level without touching the audio, exactly as specified;
// - streaming anywhere is obs's stream key + our toggle, no masky account in
//   the path. the bridge is platform-agnostic on purpose: a target (twitch,
//   kick, anything rtmp) is a server url + a key, and the per-platform files
//   live next to this one in integrations/.
//
// protocol: obs-websocket 5.x. hello -> identify (sha256 challenge/response)
// -> identified, then request/response ops with json payloads. every request
// carries a requestId; responses are matched on it. the auth math:
//   b64(sha256(b64(sha256(password + salt)) + challenge))
//
// field names here follow the obs-websocket 5.x protocol reference; the mock
// in tests/obs_test.ts speaks the same protocol, and the one thing to verify
// against a live instance is SetStreamSettings' exact params shape.

export interface ObsConfig {
  url: string; // ws://host:4455
  password?: string; // obs tools -> websocket server settings
}

const OP = {
  Hello: 0,
  Identify: 1,
  Identified: 2,
  Event: 3,
  Request: 6,
  RequestResponse: 7,
  RequestBatch: 8,
  RequestBatchResponse: 9,
} as const;

interface ObsEnvelope {
  op: number;
  d: Record<string, unknown>;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

// obs's challenge/response, verbatim from the protocol spec.
export async function obsAuthHash(
  password: string,
  challenge: string,
  salt: string,
): Promise<string> {
  const inner = b64(await sha256(password + salt));
  return b64(await sha256(inner + challenge));
}

function requestId(): string {
  return crypto.randomUUID();
}

export class ObsBridge {
  private ws: WebSocket | null = null;
  private rpcVersion = 1;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextSeq = 0;

  constructor(readonly config: ObsConfig) {}

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    const ws = new WebSocket(this.config.url);
    this.ws = ws;
    ws.onmessage = (ev) => this.onMessage(ev.data as string);
    await this.open(ws);

    // op 0 Hello arrives first and carries the auth challenge, if any.
    const hello = await this.expect(OP.Hello);
    const auth = hello.d.authentication as
      | { challenge: string; salt: string }
      | undefined;
    this.rpcVersion = (hello.d.rpcVersion as number) ?? 1;

    const identify: Record<string, unknown> = { rpcVersion: this.rpcVersion };
    if (auth) {
      if (!this.config.password) {
        throw new Error("obs websocket wants a password and none was configured");
      }
      identify.authentication = await obsAuthHash(
        this.config.password,
        auth.challenge,
        auth.salt,
      );
    }
    ws.send(JSON.stringify({ op: OP.Identify, d: identify }));
    await this.expect(OP.Identified);
  }

  private open(ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`cannot reach obs at ${this.config.url}`));
    });
  }

  private expect(op: number): Promise<ObsEnvelope> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`obs: no reply (op ${op})`)), 5000);
      this.waiters.push({ op, resolve: (env) => { clearTimeout(timer); resolve(env); }, reject });
    });
  }

  private waiters: { op: number; resolve: (env: ObsEnvelope) => void; reject: (e: Error) => void }[] = [];

  private onMessage(raw: string): void {
    let env: ObsEnvelope;
    try {
      env = JSON.parse(raw);
    } catch {
      return; // not json: ignore, obs only speaks json
    }
    // handshake ops go to expect(); the rest go to pending requests.
    const waiter = this.waiters.find((w) => w.op === env.op);
    if (waiter) {
      this.waiters = this.waiters.filter((w) => w !== waiter);
      waiter.resolve(env);
      return;
    }
    const resp = env.d as {
      requestId?: string;
      requestStatus?: { ok: boolean; comment?: string };
      responseData?: unknown;
    };
    if (env.op === OP.RequestResponse && resp.requestId) {
      const p = this.pending.get(resp.requestId);
      if (p) {
        this.pending.delete(resp.requestId);
        // op 7 responses carry their payload in responseData; requestStatus
        // says whether the request even ran.
        if (resp.requestStatus?.ok) p.resolve(resp.responseData);
        else p.reject(new Error(`obs request failed: ${resp.requestStatus?.comment ?? "unknown"}`));
      }
    }
  }

  // one op 6 request, one op 7 response, matched on requestId.
  async request<T = Record<string, unknown>>(requestType: string, requestData?: Record<string, unknown>): Promise<T> {
    if (!this.ws) throw new Error("obs bridge not connected");
    const id = requestId();
    const reply = new Promise<T>((resolve, reject) => this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject }));
    this.ws.send(JSON.stringify({ op: OP.Request, d: { requestType, requestId: id, ...(requestData ? { requestData } : {}) } }));
    return await reply;
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  // -----------------------------------------------------------------------
  // scenes and sources
  // -----------------------------------------------------------------------

  async scenes(): Promise<string[]> {
    const resp = await this.request<{ scenes: { sceneName: string }[] }>("GetSceneList");
    return resp.scenes.map((sc) => sc.sceneName);
  }

  async switchScene(sceneName: string): Promise<void> {
    await this.request("SetCurrentProgramScene", { sceneName });
  }

  // obs-websocket 5 addresses a source inside a scene by numeric itemId, not
  // by name, so resolve the name once and cache it: scenes do not change
  // behind our back mid-handoff.
  private itemIds = new Map<string, number>();

  async sceneItemId(sceneName: string, sourceName: string): Promise<number> {
    const cacheKey = `${sceneName}/${sourceName}`;
    const cached = this.itemIds.get(cacheKey);
    if (cached !== undefined) return cached;
    const resp = await this.request<{ sceneItems: { sceneItemId: number; sourceName: string }[] }>(
      "GetSceneItemList",
      { sceneName },
    );
    const item = resp.sceneItems.find((it) => it.sourceName === sourceName);
    if (!item) throw new Error(`obs: no source "${sourceName}" in scene "${sceneName}"`);
    this.itemIds.set(cacheKey, item.sceneItemId);
    return item.sceneItemId;
  }

  async setSourceVisible(sceneName: string, sourceName: string, visible: boolean): Promise<void> {
    const id = await this.sceneItemId(sceneName, sourceName);
    await this.request("SetSceneItemEnabled", {
      sceneName,
      sceneItemId: id,
      sceneItemEnabled: visible,
    });
  }

  // -----------------------------------------------------------------------
  // streaming (through obs to twitch)
  // -----------------------------------------------------------------------

  async startStream(): Promise<void> {
    await this.request("SetStreamActive", { streamActive: true });
  }

  async stopStream(): Promise<void> {
    await this.request("SetStreamActive", { streamActive: false });
  }

  async isStreaming(): Promise<boolean> {
    const resp = await this.request<{ outputActive: boolean }>("GetStreamStatus");
    return resp.outputActive;
  }

  // point obs's custom stream target at any rtmp destination. this is the
  // whole platform story: twitch, kick, or a private relay are all just
  // server + key here; the per-platform constants live in twitch.ts/kick.ts.
  // verify the params shape against a live instance when one is wired up.
  async setStreamTarget(server: string, key: string): Promise<void> {
    await this.request("SetStreamSettings", {
      streamSettingsType: "custom",
      settings: { server, key },
      save: true,
    });
  }
}
