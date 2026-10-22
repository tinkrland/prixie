// the discord watch route (the owner, oct 22 2026): the docket's discord
// eyes, over the api. the watcher itself is one long-lived gateway
// connection per server process: voice states and guild events arrive
// live; the routes only read.
//
//   POST /api/discord/watch   ensure the watcher is running
//                             body: { guild_ids?: ["...", ...] } to seed
//                             the schedule with a REST read (optional)
//   GET  /api/discord/state   open voice channels + watchable events,
//                             guild-scoped with ?guild_id=
//
// the bot token is the env's, not the request's: a caller never hands
// the server its own credentials. unset = closed, the house rule.

import { Hono } from "hono";
import {
  ensureSharedWatcher as ensureWatcher,
  watcherToken,
  getSharedWatcher,
} from "../services/discord_watch_runtime.ts";

const app = new Hono();

// the watcher singleton lives in services/discord_watch_runtime.ts:
// the routes start it, the scheduler reads the same instance to
// dispatch an attendee when a watched room's call opens. one watcher
// per process, shared by everything.

app.post("/watch", async (c) => {
  const token = watcherToken();
  if (!token) {
    return c.json({
      error: "DISCORD_BOT_TOKEN is not set; the discord watch stays closed.",
    }, 503);
  }
  let body: { guild_ids?: string[] } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const w = await ensureWatcher();
  if (!w) {
    return c.json({ error: "the discord watch could not start" }, 503);
  }
  // seed the schedule with a REST read per guild, so the state is
  // immediately useful instead of waiting for the next event dispatch
  const seeded: string[] = [];
  const failed: string[] = [];
  for (const guildId of body.guild_ids ?? []) {
    try {
      await w.listGuildEvents(guildId);
      seeded.push(guildId);
    } catch {
      failed.push(guildId); // the bot may not be in that guild: honest
    }
  }
  return c.json({ watching: true, seeded, failed, state: w.view() });
});

app.get("/state", async (c) => {
  const guildId = c.req.query("guild_id") || undefined;
  const w = getSharedWatcher();
  if (!w) {
    // not started: honest emptiness, never a fabricated docket
    return c.json({ watching: false, openVoiceChannels: [], events: [] });
  }
  return c.json({ watching: true, ...w.view(guildId) });
});

export default app;
