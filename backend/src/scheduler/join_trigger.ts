// the join gate, as one pure decision. deploy paths stay thin: they ask
// this function "join now?" and act on the answer.
//
// three triggers, one per meeting:
//   delay (default): join join_delay_minutes after start_time.
//   participants: hold until join_after_participants humans are already
//   inside. a scheduled time is a promise; a participant count is a fact.
//   room_open (the owner, oct 22 2026): join when the watched room's call is
//   actually open. a discord voice channel with occupants is a fact; the
//   scheduled time was a guess. the watcher's state decides, and a state
//   she cannot see is a hold, never a fake open.
//
// the participant count comes from the engine's pre-join read (the waiting
// room or join page states how many are in). null means the engine could
// not tell: that is a hold with the reason on it, never a fake count and
// never a silent join.

import { Meeting } from "../types.ts";

export interface JoinDecision {
  join: boolean;
  reason: string;
}

export function shouldJoinNow(
  meeting: Pick<Meeting, "start_time" | "join_delay_minutes" | "join_trigger" | "join_after_participants">,
  now: Date,
  participantCount?: number | null,
  // room_open's fact: is the call this meeting points at open right now?
  // true/false from the watcher's state; undefined = she cannot see the
  // room (no watcher, or the url is not a channel link).
  roomOpen?: boolean | null,
): JoinDecision {
  const trigger = meeting.join_trigger || "delay";

  if (trigger === "room_open") {
    if (roomOpen === true) {
      return { join: true, reason: "the watched room's call is open: dispatching" };
    }
    if (roomOpen === false) {
      return { join: false, reason: "holding: the room's call is not open yet" };
    }
    return { join: false, reason: "holding: the watcher cannot see this room yet" };
  }

  const start = Date.parse(meeting.start_time);
  if (Number.isNaN(start)) {
    return { join: false, reason: "start_time is not parseable; holding" };
  }

  if (trigger === "participants") {
    const needed = meeting.join_after_participants;
    if (!needed || needed < 1) {
      // misconfigured: the trigger with no threshold falls back to the
      // delay gate rather than joining blind.
      return delayDecision(start, meeting.join_delay_minutes ?? 2, now, "participants trigger without a threshold; falling back to delay");
    }
    if (now.getTime() < start) {
      return { join: false, reason: `holding: ${participantCount ?? 0}/${needed} present, meeting not started yet` };
    }
    if (participantCount === null || participantCount === undefined) {
      return { join: false, reason: "holding: the engine cannot see the participant count yet" };
    }
    if (participantCount >= needed) {
      return { join: true, reason: `${participantCount} participants present (needed ${needed})` };
    }
    return { join: false, reason: `holding: ${participantCount}/${needed} participants present` };
  }

  return delayDecision(start, meeting.join_delay_minutes ?? 2, now);
}

function delayDecision(
  start: number,
  delayMinutes: number,
  now: Date,
  note?: string,
): JoinDecision {
  const joinAt = start + delayMinutes * 60 * 1000;
  if (now.getTime() >= joinAt) {
    return { join: true, reason: note || `${delayMinutes} min after start` };
  }
  const waitMin = Math.max(1, Math.round((joinAt - now.getTime()) / 60000));
  return { join: false, reason: `holding: joins in ~${waitMin} min${note ? ` (${note})` : ""}` };
}
