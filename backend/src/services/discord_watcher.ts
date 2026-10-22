// the discord watcher (the owner, oct 22 2026): the docket's eyes on discord.
// she does not just scan channels for links (live_links.ts already reads
// messages, pull-style). this service watches the ROOMS:
//
//   - is a call open? the gateway says who sits in which voice channel,
//     live (VOICE_STATE_UPDATE). "the meeting is happening in that
//     speaking channel right now" is a fact she can see, not guess.
//   - the guild's event schedule: scheduled events with status, deep
//     links, subscriber counts (REST). an event flipping to ACTIVE is
//     itself the signal that the call opened.
//
// what she CANNOT do is honest and verified against the current api
// docs (oct 22 2026): there is no documented endpoint for an app to
// rsvp a user to an event. she surfaces the link; the tap is yours.
// also invisible to bots: dm calls and group dm calls.
//
// the protocol half is pure (state + message handling in, actions
// out) so tests never need a real gateway; the socket half is a thin
// loop. no test claims a gateway connected.

// ---------------------------------------------------------------------------
// gateway protocol constants (discord api v10)
// ---------------------------------------------------------------------------

export const GATEWAY_URL = "wss://gateway.discord.com/?v=10&encoding=json";

export const INTENTS = {
  GUILDS: 1 << 0,
  GUILD_VOICE_STATES: 1 << 3,
  GUILD_SCHEDULED_EVENTS: 1 << 36,
} as const;

// the watcher's intents: voice states (who is in which channel) and
// scheduled events (the schedule + the ACTIVE flip). nothing else: the
// watcher is not a bot presence, it is a docket sense.
export const WATCH_INTENTS = INTENTS.GUILD_VOICE_STATES | INTENTS.GUILD_SCHEDULED_EVENTS;

export const EVENT_STATUS: Record<number, string> = {
  1: "scheduled",
  2: "active",
  3: "completed",
  4: "canceled",
};

// ---------------------------------------------------------------------------
// the watch state, pure
// ---------------------------------------------------------------------------

export interface VoiceOccupant {
  userId: string;
  // display name from the member object when the event carries one.
  // a null name is honest: the gateway does not always include it.
  name: string | null;
}

export interface OpenVoiceChannel {
  guildId: string;
  channelId: string;
  occupants: VoiceOccupant[];
}

export interface DiscordEvent {
  id: string;
  guildId: string;
  channelId: string | null;
  name: string;
  description: string | null;
  scheduledStartTime: string;
  status: number;
  entityType: number;
  userCount: number | null;
}

export function eventDeepLink(e: { guildId: string; id: string }): string {
  return `https://discord.com/events/${e.guildId}/${e.id}`;
}

export interface DiscordWatchState {
  sessionId: string | null;
  seq: number | null;
  // guildId -> userId -> voice state (channelId null = not in a channel)
  voice: Map<string, Map<string, { channelId: string | null; name: string | null }>>;
  // guildId -> eventId -> event
  events: Map<string, Map<string, DiscordEvent>>;
}

export function newWatchState(): DiscordWatchState {
  return {
    sessionId: null,
    seq: null,
    voice: new Map(),
    events: new Map(),
  };
}

// a gateway dispatch, applied. VOICE_STATE_UPDATE moves a member between
// channels (channelId null = they left); scheduled event dispatches keep
// the event cache current so the schedule never goes stale.
export function applyDispatch(state: DiscordWatchState, t: string, d: any): void {
  switch (t) {
    case "READY": {
      state.sessionId = d?.session_id ?? null;
      return;
    }
    case "VOICE_STATE_UPDATE": {
      const guildId: string = d?.guild_id;
      const userId: string = d?.user_id;
      if (!guildId || !userId) return;
      let guild = state.voice.get(guildId);
      if (!guild) {
        guild = new Map();
        state.voice.set(guildId, guild);
      }
      const name = d?.member?.user?.username ?? d?.member?.nick ?? null;
      guild.set(userId, { channelId: d?.channel_id ?? null, name });
      return;
    }
    case "GUILD_SCHEDULED_EVENT_CREATE":
    case "GUILD_SCHEDULED_EVENT_UPDATE": {
      const guildId: string = d?.guild_id;
      const id: string = d?.id;
      if (!guildId || !id) return;
      let guild = state.events.get(guildId);
      if (!guild) {
        guild = new Map();
        state.events.set(guildId, guild);
      }
      guild.set(id, {
        id,
        guildId,
        channelId: d?.channel_id ?? null,
        name: d?.name ?? "untitled event",
        description: d?.description ?? null,
        scheduledStartTime: d?.scheduled_start_time ?? "",
        status: d?.status ?? 1,
        entityType: d?.entity_type ?? 3,
        userCount: d?.user_count ?? null,
      });
      return;
    }
    case "GUILD_SCHEDULED_EVENT_DELETE": {
      state.events.get(d?.guild_id)?.delete(d?.id);
      return;
    }
  }
}

// which voice channels have someone in them, right now. this is the
// "is a call open" answer: a channel with occupants is a call.
export function openVoiceChannels(
  state: DiscordWatchState,
  guildId?: string,
): OpenVoiceChannel[] {
  const open: OpenVoiceChannel[] = [];
  const byChannel = new Map<string, VoiceOccupant[]>();
  for (const [gid, guild] of state.voice) {
    if (guildId && gid !== guildId) continue;
    for (const [userId, vs] of guild) {
      if (!vs.channelId) continue; // left the call
      const key = `${gid}:${vs.channelId}`;
      const list = byChannel.get(key) ?? [];
      list.push({ userId, name: vs.name });
      byChannel.set(key, list);
    }
  }
  for (const [key, occupants] of byChannel) {
    const [gid, cid] = key.split(":");
    open.push({ guildId: gid, channelId: cid, occupants });
  }
  return open.sort((a, b) => a.channelId.localeCompare(b.channelId));
}

// a channel deep link -> {guildId, channelId}, pure. the dispatch
// match key: a meeting's join_url is the deep link
// (https://discord.com/channels/{guild}/{channel}), the watcher's open
// rooms are {guildId, channelId} pairs, and these two halves meet here.
export function discordChannelFromUrl(
  url: string,
): { guildId: string; channelId: string } | null {
  const m = url.match(/discord(?:\.com)?\/channels\/(\d+)\/(\d+)/);
  if (!m) return null;
  return { guildId: m[1], channelId: m[2] };
}

// is the room this url points at open right now? pure: state + url ->
// fact. occupants are the fact; a schedule is a guess.
export function roomIsOpen(state: DiscordWatchState, url: string): boolean {
  const target = discordChannelFromUrl(url);
  if (!target) return false;
  return openVoiceChannels(state).some(
    (ch) => ch.guildId === target.guildId && ch.channelId === target.channelId && ch.occupants.length > 0,
  );
}

// the events worth watching: scheduled and active only. completed and
// canceled events are not watches anymore.
export function watchableEvents(state: DiscordWatchState, guildId?: string): DiscordEvent[] {
  const out: DiscordEvent[] = [];
  for (const [gid, guild] of state.events) {
    if (guildId && gid !== guildId) continue;
    for (const e of guild.values()) {
      if (e.status === 1 || e.status === 2) out.push(e);
    }
  }
  return out.sort((a, b) => a.scheduledStartTime.localeCompare(b.scheduledStartTime));
}

// ---------------------------------------------------------------------------
// gateway message handling, protocol-pure: a raw message in, the actions
// the protocol says to take, out
// ---------------------------------------------------------------------------

export interface GatewayActions {
  send?: unknown[]; // payloads to send immediately, in order
  heartbeatEveryMs?: number; // start/keep the heartbeat clock
  close?: boolean; // the connection is done; reconnect per policy
}

export function handleGatewayMessage(
  state: DiscordWatchState,
  raw: string,
  botToken: string,
): GatewayActions {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return {}; // a malformed frame is dropped, never trusted
  }
  const op = msg?.op;
  if (op === 10) {
    // HELLO: identify with the watch intents
    return {
      send: [{
        op: 2,
        d: {
          token: `Bot ${botToken}`,
          intents: WATCH_INTENTS,
          properties: { os: "linux", browser: "prixie", device: "prixie" },
        },
      }],
      heartbeatEveryMs: msg.d?.heartbeat_interval ?? 41250,
    };
  }
  if (op === 11) return {}; // heartbeat ack: nothing to do
  if (op === 1) {
    // the server asked for a heartbeat now
    return { send: [{ op: 1, d: state.seq }] };
  }
  if (op === 0) {
    // dispatch
    if (typeof msg.s === "number") state.seq = msg.s;
    applyDispatch(state, msg.t, msg.d);
    return {};
  }
  if (op === 7) {
    // RECONNECT: resume with the session we have
    if (state.sessionId && state.seq !== null) {
      return {
        send: [{ op: 6, d: { token: `Bot ${botToken}`, session_id: state.sessionId, seq: state.seq } }],
      };
    }
    return { close: true };
  }
  if (op === 9) {
    // INVALID_SESSION: resumable only if the server says so
    if (msg.d === true && state.sessionId && state.seq !== null) {
      return {
        send: [{ op: 6, d: { token: `Bot ${botToken}`, session_id: state.sessionId, seq: state.seq } }],
      };
    }
    state.sessionId = null;
    state.seq = null;
    return { close: true };
  }
  return {};
}

// ---------------------------------------------------------------------------
// the socket half: thin. a factory makes the socket (the real one is a
// wss websocket; tests inject a fake), the loop feeds the pure handler
// ---------------------------------------------------------------------------

export interface GatewaySocket {
  send(data: string): void;
  close(): void;
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export type SocketFactory = (url: string) => Promise<GatewaySocket>;

export function defaultSocketFactory(url: string): Promise<GatewaySocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => {
      // a holder whose callbacks the watcher reassigns freely; the ws
      // handlers always read the current ones
      const holder: GatewaySocket = {
        send: (data) => ws.send(data),
        close: () => ws.close(),
        onmessage: null,
        onclose: null,
        onerror: null,
      };
      ws.onmessage = (ev: MessageEvent) => holder.onmessage?.(String(ev.data));
      ws.onclose = () => holder.onclose?.();
      ws.onerror = () => holder.onerror?.();
      resolve(holder);
    };
    ws.onerror = () => reject(new Error("discord_watcher: gateway connect failed"));
  });
}

export interface WatcherOpts {
  botToken: string;
  socketFactory?: SocketFactory;
  fetchImpl?: typeof fetch;
  apiBase?: string;
  log?: (msg: string) => void;
}

export class DiscordWatcher {
  readonly state = newWatchState();
  private socket: GatewaySocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private connectFactory: SocketFactory;
  private fetchImpl: typeof fetch;
  private apiBase: string;
  private log: (msg: string) => void;

  private botToken: string;

  constructor(opts: WatcherOpts) {
    this.botToken = opts.botToken;
    this.connectFactory = opts.socketFactory ?? defaultSocketFactory;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.apiBase = opts.apiBase ?? "https://discord.com/api/v10";
    this.log = opts.log ?? (() => {});
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearHeartbeat();
    this.socket?.close();
    this.socket = null;
  }

  private async connect(): Promise<void> {
    const socket = await this.connectFactory(GATEWAY_URL);
    this.socket = socket;
    socket.onmessage = (data) => this.onMessage(data);
    socket.onclose = () => {
      this.clearHeartbeat();
      if (!this.stopped) {
        // the gateway closes; the watcher comes back. a docket is patient.
        this.log("discord_watcher: gateway closed; reconnecting");
        setTimeout(() => this.connect().catch(() => {}), 5000);
      }
    };
  }

  private onMessage(raw: string): void {
    const actions = handleGatewayMessage(this.state, raw, this.botToken);
    for (const payload of actions.send ?? []) {
      this.socket?.send(JSON.stringify(payload));
    }
    if (actions.heartbeatEveryMs !== undefined) {
      this.clearHeartbeat();
      const interval = actions.heartbeatEveryMs;
      this.heartbeatTimer = setInterval(() => {
        this.socket?.send(JSON.stringify({ op: 1, d: this.state.seq }));
      }, interval);
    }
    if (actions.close) {
      // closing is how resume works: the reconnect leg in onclose opens a
      // fresh socket, and the session/seq in the state make it resume.
      this.socket?.close();
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // the REST half: the guild's schedule with subscriber counts. gateway
  // events keep it live between reads; this is the first honest look.
  async listGuildEvents(guildId: string, withUserCount = true): Promise<DiscordEvent[]> {
    const url =
      `${this.apiBase}/guilds/${guildId}/scheduled-events?with_user_count=${withUserCount}`;
    const res = await this.fetchImpl(url, {
      headers: { Authorization: `Bot ${this.botToken}` },
    });
    if (!res.ok) {
      throw new Error(`discord_watcher: list events failed (${res.status})`);
    }
    const raw: any[] = await res.json();
    const guild = this.state.events.get(guildId) ?? new Map();
    this.state.events.set(guildId, guild);
    for (const d of raw) {
      guild.set(d.id, {
        id: d.id,
        guildId: d.guild_id,
        channelId: d.channel_id ?? null,
        name: d.name,
        description: d.description ?? null,
        scheduledStartTime: d.scheduled_start_time,
        status: d.status,
        entityType: d.entity_type,
        userCount: d.user_count ?? null,
      });
    }
    return [...guild.values()];
  }

  // a serializable view for the api: open calls + watchable events,
  // with the deep links and the honest rsvp note attached where it fits.
  view(guildId?: string) {
    return {
      openVoiceChannels: openVoiceChannels(this.state, guildId),
      events: watchableEvents(this.state, guildId).map((e) => ({
        ...e,
        statusName: EVENT_STATUS[e.status] ?? "unknown",
        deepLink: eventDeepLink(e),
        // verified oct 22 2026: no api endpoint lets an app rsvp for a
        // user. the link is ours to hand over; the tap is the human's.
        rsvp: "not ours to tap: no documented api can rsvp for you",
      })),
    };
  }
}
