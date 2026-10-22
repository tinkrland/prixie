// the shared discord watcher runtime (the owner, oct 22 2026). one watcher
// per process: the route starts it, the scheduler reads it. the state
// is the docket's discord eyes, and the dispatch wire needs the same
// instance both sides see.
//
//   getSharedWatcher()   the live watcher, or null (never starts one)
//   ensureSharedWatcher() starts it with the env token if needed; null
//                         when DISCORD_BOT_TOKEN is unset: closed is
//                         closed, the house rule.

import { DiscordWatcher } from "./discord_watcher.ts";

let watcher: DiscordWatcher | null = null;
let starting: Promise<DiscordWatcher | null> | null = null;

export function watcherToken(): string | null {
  return Deno.env.get("DISCORD_BOT_TOKEN") || null;
}

export async function ensureSharedWatcher(): Promise<DiscordWatcher | null> {
  if (watcher) return watcher;
  const token = watcherToken();
  if (!token) return null; // closed is closed
  if (!starting) {
    starting = (async () => {
      const w = new DiscordWatcher({ botToken: token });
      await w.start();
      watcher = w;
      return w;
    })().catch((e) => {
      starting = null;
      throw e;
    });
  }
  return starting;
}

// the live state, or null when nobody is watching. reads never start
// the watcher: a scheduler cycle with no discord token simply sees no
// discord rooms, and that is honest.
export function getSharedWatcher(): DiscordWatcher | null {
  return watcher;
}
