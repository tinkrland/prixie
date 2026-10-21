// the join gate, as one pure decision. deploy paths stay thin: they ask
// this function "join now?" and act on the answer.
//
// two triggers, one per meeting:
//   delay (default): join join_delay_minutes after start_time.
//   participants: hold until join_after_participants humans are already
//   inside. a scheduled time is a promise; a participant count is a fact.
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
): JoinDecision {
  const start = Date.parse(meeting.start_time);
  if (Number.isNaN(start)) {
    return { join: false, reason: "start_time is not parseable; holding" };
  }

  const trigger = meeting.join_trigger || "delay";

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
