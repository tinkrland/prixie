// discord identity anchors + the call-open facts (anne, oct 29 2026).
//
// discord is the surface whose handles are already in hand: every voice
// state carries a numeric userId, which is exactly the handle shape the
// anchors store. so occupants resolve without guessing, and the owner
// walking into a room is a fact the head can hold: "the owner is in
// <channel>" with platform:discord + connection:owner stamped.
//
// the read path (GET /api/discord/state) stays pure: it annotates, it
// does not write. the writes happen here, at the scheduler's pass, with
// an in-process dedupe so one open call is one fact, not one per poll.
// a channel that empties is forgotten, so the NEXT call in the same
// room is a new fact.

import type { OpenVoiceChannel, VoiceOccupant } from "./discord_watcher.ts";
import { scopeFor } from "./memory_scope.ts";
import { ingestMemory } from "./retelldb.ts";
import type { Connection } from "./connections.ts";

export interface AnchoredOccupant extends VoiceOccupant {
  // who this is, per the anchors. a display name alone never anchors.
  anchor: "owner" | "anchored" | "stranger" | "no_config" | "ambiguous";
  connection_id: string | null;
  connection_label: string | null;
}

// annotate one occupant by its numeric userId. no names, no guessing.
export function annotateOccupant(
  occupant: VoiceOccupant,
  connections?: Connection[],
): AnchoredOccupant {
  const scope = scopeFor("discord", occupant.userId, { connections });
  return {
    ...occupant,
    anchor: scope.anchor,
    connection_id: scope.connection_id,
    connection_label: null, // filled by the caller when it has the anchor list
  };
}

export function annotateChannel(
  channel: OpenVoiceChannel,
  connections?: Connection[],
): { guildId: string; channelId: string; occupants: AnchoredOccupant[] } {
  return {
    guildId: channel.guildId,
    channelId: channel.channelId,
    occupants: (channel.occupants || []).map((o) => annotateOccupant(o, connections)),
  };
}

// --- the write side: one fact per opened call -----------------------

const seenOpen = new Set<string>();

export function resetSeenCallsForTests(): void {
  seenOpen.clear();
}

function callKey(channel: OpenVoiceChannel): string {
  return `${channel.guildId}:${channel.channelId}`;
}

// called by the scheduler each pass with the watcher's current open
// channels. returns the facts it wrote (for tests and logs).
export async function noteOpenCalls(
  open: OpenVoiceChannel[],
  connections?: Connection[],
): Promise<Array<{ key: string; ingested: boolean }>> {
  const out: Array<{ key: string; ingested: boolean }> = [];
  const current = new Set(open.map(callKey));

  // a channel that is no longer open is forgotten: the next call there
  // is a new fact, not a duplicate of the old one
  for (const key of [...seenOpen]) {
    if (!current.has(key)) seenOpen.delete(key);
  }

  for (const channel of open) {
    const key = callKey(channel);
    if (seenOpen.has(key)) continue;
    seenOpen.add(key);

    const occupants = (channel.occupants || []).map((o) => annotateOccupant(o, connections));
    const owner = occupants.find((o) => o.anchor === "owner");
    // the owner's own presence is the fact worth holding. a room full
    // of strangers is not hers to remember.
    if (!owner) {
      out.push({ key, ingested: false });
      continue;
    }
    const result = await ingestMemory(
      [
        `the owner was in a discord voice call (guild ${channel.guildId}, channel ${channel.channelId}).`,
        `occupants anchored: ${occupants.filter((o) => o.connection_id).length} of ${occupants.length}.`,
        `seen at ${new Date().toISOString()}.`,
      ].join(" "),
      scopeFor("discord", owner.userId, { connections }),
      { title: "owner in a discord voice call" },
    );
    out.push({ key, ingested: Boolean(result) });
  }
  return out;
}

// state -> the channels that are open right now. same rule as the
// watcher's own state read: a voice channel with occupants IS a call.
export function openChannelsFromState(state: {
  voice: Map<string, Map<string, { channelId: string | null; name: string | null }>>;
}): OpenVoiceChannel[] {
  const open: OpenVoiceChannel[] = [];
  for (const [guildId, members] of state.voice) {
    const byChannel = new Map<string, VoiceOccupant[]>();
    for (const [userId, vs] of members) {
      if (!vs.channelId) continue;
      const list = byChannel.get(vs.channelId) || [];
      list.push({ userId, name: vs.name });
      byChannel.set(vs.channelId, list);
    }
    for (const [channelId, occupants] of byChannel) {
      if (occupants.length) open.push({ guildId, channelId, occupants });
    }
  }
  return open;
}
