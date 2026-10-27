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
  createSession,
  joinMeeting,
  getSessionStatus,
  stopSession,
  installChatMonitor,
  sendChatInSession,
  setScreenshareInSession,
  heartbeatSession,
  unmuteAndSpeakInSession,
  getParticipantsInSession,
  findAndClickByText,
  probeEntryState,
  KNOCK_TEXTS,
} from "./browserbase.ts";
import { shareLinkInSession, stopLinkShare, navigateSharedLink, clickSharedLink, narrateSlide, advanceSlide } from "./link_share.ts";
import { reactInSession, raiseHandInSession, getActiveScreensharerInSession } from "./browserbase.ts";
import { transcribeBrowserbaseSession } from "./browserbase_transcript.ts";
import { recordOwnChatLine } from "./chat_takehome.ts";
import {
  isZoomRegisterUrl,
  registerZoom,
  type ZoomRegistrationResult,
} from "./browserbase.ts";
import { updateMeeting } from "./supabase.ts";
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

    // zoom registration links (the owner, oct 22 2026): a register-shaped
    // link is a signup, not a join. she registers in a side session,
    // and only the confirmation page's real join link is ever joined.
    // the row records the resolved link, so no cycle registers twice.
    let meetingUrl = meeting.join_url;
    if (isZoomRegisterUrl(meetingUrl)) {
      const formName = Deno.env.get("PRIXIE_FORM_NAME") || profileName;
      const formEmail = Deno.env.get("PRIXIE_FORM_EMAIL");
      if (!formEmail) {
        throw new Error("zoom registration needs PRIXIE_FORM_EMAIL, never the owner's address");
      }
      const regSession = await createSession();
      let reg: ZoomRegistrationResult;
      try {
        reg = await registerZoom(regSession.id, meetingUrl, formName, formEmail);
      } finally {
        await stopSession(regSession.id).catch(() => {});
      }
      if (!reg.ok || !reg.joinUrl) {
        throw new Error(`zoom registration did not yield a join link: ${reg.error}`);
      }
      console.log(`prixie: zoom registration resolved the join link for meeting ${meeting.id}`);
      meetingUrl = reg.joinUrl;
      await updateMeeting(meeting.id, { join_url: meetingUrl }).catch(() => {});
    }

    const result = await joinMeeting(meeting.platform || "custom", meetingUrl, profileName);

    if (result.status === "waiting_room") {
      // she asked (maybe several times) and nobody let her in yet. the
      // session STAYS ALIVE: the knock loop keeps re-asking, and the
      // manager polls getStatus until the page says she entered. this
      // is joining, not success: success is the in-call UI (the owner, oct
      // 22 2026).
      console.log(
        `prixie: waiting room for ${meeting.id}: ${result.error} (session ${result.session_id} stays up)`,
      );
      return { id: result.session_id, status: "joining" };
    }

    if (result.status !== "joined") {
      if (result.session_id) await stopSession(result.session_id).catch(() => {});
      throw new Error(`browserbase join failed: ${result.error || result.status}`);
    }

    // watch the chat so capture requests can fire in real time
    if (options?.realtimeWebhookUrl) {
      const ok = await installChatMonitor(
        result.session_id,
        options.realtimeWebhookUrl,
        Deno.env.get("REALTIME_WEBHOOK_SECRET"),
      ).catch(() => false);
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
      const norm = normalizeSessionStatus(s);
      // a running session is not presence. the page says whether she is
      // actually in the call: in-call UI = in_meeting; a waiting room
      // means she is still knocking, so knock once more per poll (the
      // mods-missed-a-popup badger, bounded by the poll cadence).
      if (norm === "in_meeting") {
        const state = await probeEntryState(botId).catch(() => "unknown");
        if (state === "entered") return { status: "in_meeting", detail: s?.status || s?.state };
        if (state === "waiting") {
          await findAndClickByText(botId, KNOCK_TEXTS, "button, div[role='button']", 3000).catch(() => false);
          return { status: "joining", detail: "waiting room: knocked again" };
        }
        return { status: "joining", detail: "session up, entry state unknown" };
      }
      return { status: norm, detail: s?.status || s?.state };
    } catch {
      return { status: "error", detail: "session lookup failed" };
    }
  }

  async sendChatMessage(botId: string, messageText: string): Promise<boolean> {
    const r = await sendChatInSession(botId, messageText);
    if (r.sent) await recordOwnChatLine(botId, messageText);
    return r.sent;
  }

  // a named recipient, and only that recipient. no silent broadcast
  // when the dm cannot be made: the caller decides the fallback.
  async sendDirectChatMessage(botId: string, messageText: string, toName: string): Promise<boolean> {
    const r = await sendChatInSession(botId, messageText, toName);
    if (r.sent && r.to === "dm") await recordOwnChatLine(botId, messageText);
    return r.sent && r.to === "dm";
  }

  // the show-and-tell switch (see setScreenshareInSession)
  async startScreenshare(botId: string): Promise<boolean> {
    return setScreenshareInSession(botId, "start");
  }

  async stopScreenshare(botId: string): Promise<boolean> {
    return setScreenshareInSession(botId, "stop");
  }

  // the show-and-tell with a url: share a deployed page (deck, site,
  // doc) from a second session, pixel-true, no vm (see link_share.ts)
  async startLinkShare(botId: string, url: string, audio?: boolean): Promise<boolean> {
    const r = await shareLinkInSession(botId, url, audio);
    if (!r.ok) console.error("link share start:", r.reason);
    return r.ok;
  }

  async stopLinkShare(botId: string): Promise<boolean> {
    const r = await stopLinkShare(botId);
    return r.ok;
  }

  async navigateLinkShare(botId: string, url: string): Promise<boolean> {
    const r = await navigateSharedLink(botId, url);
    if (!r.ok) console.error("link share navigate:", r.reason);
    return r.ok;
  }

  async clickLinkShare(botId: string, selector?: string, text?: string): Promise<boolean> {
    const r = await clickSharedLink(botId, selector, text);
    if (!r.ok) console.error("link share click:", r.reason);
    return r.ok;
  }

  // presenter mode: speak the current slide (notes first, persona
  // memory as the floor), advance the deck one step
  async narrateLinkSlide(botId: string): Promise<boolean> {
    const r = await narrateSlide(botId);
    if (!r.ok) console.error("link share narrate:", r.reason);
    return r.ok;
  }

  async advanceLinkSlide(botId: string): Promise<boolean> {
    const r = await advanceSlide(botId);
    if (!r.ok) console.error("link share advance:", r.reason);
    return r.ok;
  }

  // reactions + raise hand (meet's dom or the sdk's page seam), and
  // screensharing awareness: who is presenting, from inside the room
  async react(botId: string, emoji: string): Promise<boolean> {
    const ok = await reactInSession(botId, emoji);
    if (!ok) console.log(`prixie: reaction ${emoji} could not be sent (host restriction or no tray)`);
    return ok;
  }

  async raiseHand(botId: string): Promise<boolean> {
    const ok = await raiseHandInSession(botId);
    if (!ok) console.log("prixie: raise hand could not be made (host restriction or no control)");
    return ok;
  }

  async getActiveScreensharer(botId: string): Promise<string | null> {
    return await getActiveScreensharerInSession(botId);
  }

  // entry-time monitor install. installChatMonitor carries its own
  // window.__prixieChatMonitor guard, so this is safe to call on every
  // entry transition (a session monitored at deploy stays "already").
  async installMonitor(botId: string, webhookUrl: string): Promise<boolean> {
    return installChatMonitor(botId, webhookUrl, Deno.env.get("REALTIME_WEBHOOK_SECRET")).catch(() => false);
  }

  async unmuteAndSpeak(botId: string, question: string): Promise<boolean> {
    return unmuteAndSpeakInSession(botId, question);
  }

  async getParticipants(botId: string): Promise<import("./browserbase.ts").ParticipantInfo[] | null> {
    return getParticipantsInSession(botId);
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
