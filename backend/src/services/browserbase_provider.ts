// browserbase bot provider - prixie's universal join engine.
// every platform goes through the same headless browser: join, watch chat,
// poll lifecycle, hand the recording to assembly.ai for the transcript.

import type {
  BotProvider,
  CreateBotOptions,
  ProviderBotStatus,
  ProviderTranscript,
} from "./bot_provider.ts";
import type { Meeting } from "../types.ts";
import {
  joinMeeting,
  getSessionStatus,
  stopSession,
  installChatMonitor,
  sendChatInSession,
  heartbeatSession,
} from "./browserbase.ts";
import { transcribeBrowserbaseSession } from "./browserbase_transcript.ts";
import { readPreJoinParticipantCount } from "./browserbase_extended.ts";

// session statuses browserbase reports, normalized to prixie lifecycle states
function normalizeSessionStatus(raw: any): ProviderBotStatus {
  const s = String(raw?.status || raw?.state || "").toLowerCase();
  if (s === "running" || s === "live" || s === "active") return "in_meeting";
  if (s === "error" || s === "failed") return "error";
  if (s === "completed" || s === "terminated" || s === "closed" || s === "expired") return "ended";
  return "joining";
}

export class BrowserbaseProvider implements BotProvider {
  readonly name = "browserbase";

  async createBot(
    meeting: Meeting,
    options?: CreateBotOptions
  ): Promise<{ id: string; status: ProviderBotStatus }> {
    const profileName = await resolveProfileName(meeting);
    const result = await joinMeeting(meeting.platform || "custom", meeting.join_url, profileName);

    if (result.status !== "joined") {
      if (result.session_id) await stopSession(result.session_id).catch(() => {});
      throw new Error(`browserbase join failed: ${result.error || result.status}`);
    }

    // watch the chat so capture requests can fire in real time
    if (options?.realtimeWebhookUrl) {
      const ok = await installChatMonitor(result.session_id, options.realtimeWebhookUrl).catch(() => false);
      if (!ok) console.warn(`prixie: chat monitor not installed on session ${result.session_id}`);
    }

    return { id: result.session_id, status: "in_meeting" };
  }

  // the "join after N people" gate: a throwaway session reads the
  // pre-join page's stated count. null when the page does not say.
  async participantCount(meeting: Meeting): Promise<number | null> {
    return readPreJoinParticipantCount(meeting.join_url);
  }

  async getStatus(botId: string): Promise<{ status: ProviderBotStatus; detail?: string }> {
    try {
      const s = await getSessionStatus(botId);
      return { status: normalizeSessionStatus(s), detail: s?.status || s?.state };
    } catch {
      return { status: "error", detail: "session lookup failed" };
    }
  }

  async sendChatMessage(botId: string, messageText: string): Promise<boolean> {
    return sendChatInSession(botId, messageText);
  }

  async getTranscript(botId: string): Promise<ProviderTranscript> {
    const transcript = await transcribeBrowserbaseSession(botId);
    return {
      text: transcript.text,
      summary: transcript.summary,
      utterances: transcript.utterances,
    };
  }

  async destroy(botId: string): Promise<void> {
    await stopSession(botId).catch(() => {});
  }

  async heartbeat(botId: string): Promise<void> {
    await heartbeatSession(botId).catch(() => {});
  }
}

async function resolveProfileName(meeting: Meeting): Promise<string> {
  if (!meeting.profile_id) return Deno.env.get("BOT_NAME") || "prixie";
  try {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", meeting.profile_id)
      .single();
    return profile?.display_name || Deno.env.get("BOT_NAME") || "prixie";
  } catch {
    return Deno.env.get("BOT_NAME") || "prixie";
  }
}

// the active engine. swap this assignment (or make it configurable) to change
// how prixie joins meetings without touching any route or the scheduler.
export const botProvider: BotProvider = new BrowserbaseProvider();
