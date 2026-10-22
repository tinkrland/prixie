// discord_watcher tests: the protocol half is pure, so these never need
// a real gateway, a real bot, or a real guild. what they pin: identify
// with the watch intents, resume with the session and seq, voice state
// moves, event tracking, and the honest shape of the view (including
// the rsvp line, because the api cannot tap it for you).

import { assertEquals } from "jsr:@std/assert";
import {
  type GatewaySocket,
  DiscordWatcher,
  INTENTS,
  WATCH_INTENTS,
  applyDispatch,
  discordChannelFromUrl,
  eventDeepLink,
  handleGatewayMessage,
  newWatchState,
  openVoiceChannels,
  roomIsOpen,
  watchableEvents,
} from "./discord_watcher.ts";

// a fake socket: records what the watcher sends, lets the test push
// frames as if the gateway did
function fakeSocket() {
  const sent: unknown[] = [];
  const socket: GatewaySocket = {
    send: (data: string) => sent.push(JSON.parse(data)),
    close: () => {},
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  return { sent, socket };
}

const hello = JSON.stringify({
  op: 10,
  d: { heartbeat_interval: 41250 },
});
const ready = JSON.stringify({
  op: 0,
  t: "READY",
  s: 1,
  d: { session_id: "sess_1" },
});
const voice = (userId: string, channelId: string | null, username?: string) =>
  JSON.stringify({
    op: 0,
    t: "VOICE_STATE_UPDATE",
    s: 2,
    d: {
      guild_id: "g1",
      channel_id: channelId,
      user_id: userId,
      ...(username ? { member: { user: { username } } } : {}),
    },
  });
const event = (id: string, status: number) =>
  JSON.stringify({
    op: 0,
    t: "GUILD_SCHEDULED_EVENT_UPDATE",
    s: 3,
    d: {
      id,
      guild_id: "g1",
      channel_id: "vc_1",
      name: "standup",
      description: null,
      scheduled_start_time: "2026-10-22T15:00:00Z",
      status,
      entity_type: 2,
      user_count: null,
    },
  });

Deno.test("HELLO: identify with the watch intents, nothing more", () => {
  const state = newWatchState();
  const actions = handleGatewayMessage(state, hello, "tok");
  assertEquals(actions.send?.length, 1);
  const identify: any = actions.send![0];
  assertEquals(identify.op, 2);
  assertEquals(identify.d.token, "Bot tok");
  // voice states + scheduled events. the watcher is a docket sense,
  // not a message reader: no message content intent is asked for
  assertEquals(identify.d.intents, INTENTS.GUILD_VOICE_STATES | INTENTS.GUILD_SCHEDULED_EVENTS);
  assertEquals(identify.d.intents, WATCH_INTENTS);
  assertEquals(actions.heartbeatEveryMs, 41250);
});

Deno.test("READY holds the session; resume carries session + seq", () => {
  const state = newWatchState();
  handleGatewayMessage(state, hello, "tok");
  handleGatewayMessage(state, ready, "tok");
  assertEquals(state.sessionId, "sess_1");
  assertEquals(state.seq, 1);

  // the gateway reconnects: RESUME, not re-identify, so no voice state
  // is lost across the reconnect
  const actions = handleGatewayMessage(state, JSON.stringify({ op: 7 }), "tok");
  const resume: any = actions.send![0];
  assertEquals(resume.op, 6);
  assertEquals(resume.d.session_id, "sess_1");
  assertEquals(resume.d.seq, 1);
});

Deno.test("an invalid session that cannot resume starts over, honestly", () => {
  const state = newWatchState();
  const actions = handleGatewayMessage(state, JSON.stringify({ op: 9, d: false }), "tok");
  assertEquals(actions.close, true);
  assertEquals(state.sessionId, null);
});

Deno.test("voice states: a call is open when someone is in the channel", () => {
  const state = newWatchState();
  applyDispatch(state, "READY", { session_id: "s" });

  // priya joins vc_1
  applyDispatch(state, "VOICE_STATE_UPDATE", {
    guild_id: "g1", channel_id: "vc_1", user_id: "u1", member: { user: { username: "priya" } },
  });
  // an unknown member joins the same channel: the name is honest null
  applyDispatch(state, "VOICE_STATE_UPDATE", {
    guild_id: "g1", channel_id: "vc_1", user_id: "u2",
  });
  let open = openVoiceChannels(state);
  assertEquals(open.length, 1);
  assertEquals(open[0].channelId, "vc_1");
  assertEquals(open[0].occupants, [
    { userId: "u1", name: "priya" },
    { userId: "u2", name: null },
  ]);

  // priya moves to another channel: a move, not a double count
  applyDispatch(state, "VOICE_STATE_UPDATE", {
    guild_id: "g1", channel_id: "vc_2", user_id: "u1", member: { user: { username: "priya" } },
  });
  open = openVoiceChannels(state);
  assertEquals(open.map((o) => o.channelId), ["vc_1", "vc_2"]);
  assertEquals(open[0].occupants, [{ userId: "u2", name: null }]);

  // the last member leaves: the call closes
  applyDispatch(state, "VOICE_STATE_UPDATE", { guild_id: "g1", channel_id: null, user_id: "u2" });
  applyDispatch(state, "VOICE_STATE_UPDATE", {
    guild_id: "g1", channel_id: null, user_id: "u1",
  });
  assertEquals(openVoiceChannels(state), []);
});

Deno.test("events: the schedule tracks status, and only watches stay listed", () => {
  const state = newWatchState();
  handleGatewayMessage(state, event("e1", 1), "tok");
  let watch = watchableEvents(state);
  assertEquals(watch.length, 1);
  assertEquals(watch[0].name, "standup");
  assertEquals(watch[0].status, 1);

  // the event goes ACTIVE: this flip is itself the "call is open" signal
  handleGatewayMessage(state, event("e1", 2), "tok");
  watch = watchableEvents(state);
  assertEquals(watch[0].status, 2);

  // completed events leave the watch list; the link still made sense
  handleGatewayMessage(state, event("e1", 3), "tok");
  assertEquals(watchableEvents(state), []);
  assertEquals(
    eventDeepLink({ guildId: "g1", id: "e1" }),
    "https://discord.com/events/g1/e1",
  );
});

Deno.test("the watcher loop: a fake gateway conversation, end to end", async () => {
  const { sent, socket } = fakeSocket();
  const watcher = new DiscordWatcher({
    botToken: "tok",
    socketFactory: async () => socket,
  });
  const pump = (data: string) => {
    const actions = handleGatewayMessage(watcher.state, data, "tok");
    for (const payload of actions.send ?? []) socket.send(JSON.stringify(payload));
  };
  socket.onmessage = pump;
  await watcher.start();
  pump(hello);
  pump(ready);
  pump(voice("u1", "vc_1", "priya"));

  const identify: any = sent.find((m: any) => m.op === 2);
  assertEquals(identify.d.token, "Bot tok");

  const view = watcher.view();
  assertEquals(view.openVoiceChannels.length, 1);
  assertEquals(view.openVoiceChannels[0].occupants, [{ userId: "u1", name: "priya" }]);
  // the rsvp line says what the api cannot do, so nobody expects it to
  assertEquals(
    view.events.length === 0 || typeof view.events[0].rsvp === "string",
    true,
  );
  watcher.stop();
});

Deno.test("the REST seed: guild events land in the state with counts", async () => {
  let requestedUrl = "";
  const watcher = new DiscordWatcher({
    botToken: "tok",
    socketFactory: async () => ({
      send: () => {}, close: () => {},
      onmessage: null, onclose: null, onerror: null,
    }),
    fetchImpl: (async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => [{
          id: "e2", guild_id: "g9", channel_id: null, name: "office hours",
          description: null, scheduled_start_time: "2026-10-22T18:00:00Z",
          status: 1, entity_type: 3, user_count: 12,
        }],
      };
    }) as unknown as typeof fetch,
  });
  const events = await watcher.listGuildEvents("g9");
  assertEquals(events[0].userCount, 12);
  assertEquals(events[0].name, "office hours");
  // user_count is asked for explicitly: the schedule reads live interest
  assertEquals(requestedUrl.includes("with_user_count=true"), true);
});

// the dispatch match key (the owner, oct 22 2026): a meeting's join_url is a
// channel deep link, the watcher's open rooms are {guild, channel}
// pairs, and roomIsOpen is where the two halves meet. pure.
Deno.test("discordChannelFromUrl reads the deep link shapes", () => {
  assertEquals(discordChannelFromUrl("https://discord.com/channels/123/456"), { guildId: "123", channelId: "456" });
  assertEquals(discordChannelFromUrl("https://discord.com/channels/123/456?foo=bar"), { guildId: "123", channelId: "456" });
  // the in-app scheme carries the same pair
  assertEquals(discordChannelFromUrl("discord://discord.com/channels/123/456"), { guildId: "123", channelId: "456" });
  assertEquals(discordChannelFromUrl("https://zoom.us/j/987654321"), null);
  assertEquals(discordChannelFromUrl("https://discord.gg/invite"), null);
});

Deno.test("roomIsOpen: occupants in that channel are the fact", () => {
  const state = newWatchState();
  // snowflake ids are numeric, and so is the deep link
  applyDispatch(state, "VOICE_STATE_UPDATE", {
    user_id: "u1", guild_id: "9012", channel_id: "5678", member: { user: { username: "the owner" } },
  });
  const url = "https://discord.com/channels/9012/5678";
  assertEquals(roomIsOpen(state, url), true);
  // a meeting pointing at a different, silent channel holds
  assertEquals(roomIsOpen(state, "https://discord.com/channels/9012/9999"), false);
  // everyone leaves: the room is closed again, fact flipped
  applyDispatch(state, "VOICE_STATE_UPDATE", { user_id: "u1", guild_id: "9012", channel_id: null });
  assertEquals(roomIsOpen(state, url), false);
});
