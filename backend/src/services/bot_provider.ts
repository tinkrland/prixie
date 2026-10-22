// bot provider seam - the one interface everything talks to.
// any meeting bot engine (browserbase today, anything else later) implements this.

import { Meeting } from "../types.ts";

export type ProviderBotStatus =
  | "joining"      // bot is starting up / navigating to the meeting
  | "in_meeting"   // bot is inside the call
  | "ended"        // call over, media ready for processing
  | "error";       // something went wrong

export interface ProviderTranscript {
  text: string;
  summary?: string;
  utterances?: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
}

export interface CreateBotOptions {
  // absolute url the engine should push realtime events to (transcript + chat)
  realtimeWebhookUrl?: string;
}

import type { ParticipantInfo } from "./browserbase.ts";

export interface BotProvider {
  readonly name: string;

  // deploy prixie to a meeting. returns the engine's bot/session id
  createBot(meeting: Meeting, options?: CreateBotOptions): Promise<{ id: string; status: ProviderBotStatus }>;

  // current lifecycle state of the bot
  getStatus(botId: string): Promise<{ status: ProviderBotStatus; detail?: string }>;

  // how many humans are already inside, read from outside the room (the
  // pre-join / waiting room page). engines that cannot tell return null;
  // that is a hold, never a fake count.
  participantCount?(meeting: Meeting): Promise<number | null>;

  // optional: the participant list WITH ROLES, read from inside the
  // room. who is host, who is cohost, by display name. engines that
  // cannot tell return null: a "we do not know", never a guess.
  getParticipants?(botId: string): Promise<ParticipantInfo[] | null>;

  // send a chat message as prixie from inside the meeting
  sendChatMessage(botId: string, messageText: string): Promise<boolean>;

  // optional: the q&a flow's prompted out-loud ask. unmute and speak a
  // question, only ever after a human prompted her to. engines whose
  // bots have no mic return false and the caller falls back to chat.
  unmuteAndSpeak?(botId: string, question: string): Promise<boolean>;

  // full transcript for a finished meeting
  getTranscript(botId: string): Promise<ProviderTranscript>;

  // optional: keep a long-running session from looking idle (no-op if not needed)
  heartbeat?(botId: string): Promise<void>;

  // optional: install the in-page chat monitor on a live session.
  // idempotent by contract: installing on an already-monitored session
  // is a no-op, so the manager can call it on every entry transition
  // without double-reporting. this is how a waiting-room admission
  // gets monitored (the owner, oct 22 2026: the monitor rides entry, not
  // deployment): the host letting her in minutes later is the moment
  // it goes in, and a late join gets it the same way.
  installMonitor?(botId: string, webhookUrl: string): Promise<boolean>;

  // tear the bot down
  destroy(botId: string): Promise<void>;
}
