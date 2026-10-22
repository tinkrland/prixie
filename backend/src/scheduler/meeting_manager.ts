import {
  getScheduledUpcomingMeetings,
  getActiveMeetings,
  getCompletedMeetingsWithoutTranscript,
  updateMeeting,
  createTranscript,
  createAttendanceMessage,
  getPendingCaptureRequestsByMeeting,
  updateCaptureRequest,
} from "../services/supabase.ts";
import { botProvider } from "../services/browserbase_provider.ts";
import { searchForKeywords } from "../services/browserbase_transcript.ts";
import { processTranscript, containsDevanagari, hinglishStats } from "../services/hinglish.ts";
import { calendarService } from "../services/calendar.ts";
import { shouldJoinNow } from "./join_trigger.ts";
import { discordChannelFromUrl, roomIsOpen } from "../services/discord_watcher.ts";
import { getSharedWatcher } from "../services/discord_watch_runtime.ts";
import { enterForm } from "../services/form_entry.ts";
import { chooseFormEmail } from "../services/form_email.ts";
import { assertLinkSafe } from "../services/link_safety.ts";

// every platform goes through the same provider. no per-platform forks anymore.
const provider = botProvider;

// grace period after meeting end before we treat a still-running session as over
const END_GRACE_MINUTES = 10;

export class MeetingManager {
  private isRunning = false;

  public startScheduler(intervalMs = 60000) {
    if (this.isRunning) {
      console.log("prixie: meeting manager scheduler is already running");
      return;
    }

    this.isRunning = true;
    console.log(`prixie: starting meeting manager scheduler (interval: ${intervalMs / 1000}s)`);

    this.runCycle();
    setInterval(() => this.runCycle(), intervalMs);
  }

  public async runCycle() {
    try {
      // the pull calendars (outlook, apple) have no push webhook like
      // google's, so the cycle re-reads them: candidates -> meetings ->
      // deployed below like any other source.
      await calendarService.syncPullCalendars();
      await this.deployUpcomingBots();
      await this.checkActiveMeetingsStatus();
      await this.processCompletedTranscripts();
    } catch (err: any) {
      console.error("prixie: error during meeting manager scheduler cycle:", err);
    }
  }

  private realtimeWebhookUrl(): string {
    const baseUrl = Deno.env.get("BASE_URL") || Deno.env.get("WEBHOOK_URL") || "https://prixie.yourdomain.com";
    return `${baseUrl}/webhooks/realtime`;
  }

  private async deployUpcomingBots() {
    const upcoming = await getScheduledUpcomingMeetings(5);
    if (upcoming.length === 0) return;

    console.log(`prixie: found ${upcoming.length} upcoming meeting(s) to deploy`);

    for (const meeting of upcoming) {
      try {
        if (meeting.bot_id && (meeting.status === "bot_joining" || meeting.status === "bot_in_meeting")) {
          continue;
        }

        // the join gate. delay: N minutes after start. participants: hold
        // until N humans are already inside (the engine reads the count
        // from the pre-join page; a page that will not say is a hold).
        // room_open: the discord watcher's state decides (the owner, oct 22
        // 2026): a voice channel with occupants IS the call happening.
        let participantCount: number | null | undefined = undefined;
        let roomOpen: boolean | null | undefined = undefined;
        const trigger = meeting.join_trigger || "delay";
        if (trigger === "participants") {
          participantCount = provider.participantCount
            ? await provider.participantCount(meeting).catch(() => null)
            : null;
        }
        if (trigger === "room_open") {
          const w = getSharedWatcher();
          // a url that is not a channel link is "cannot see", not
          // "closed": the watcher would never say false about a room it
          // cannot name.
          const target = discordChannelFromUrl(meeting.join_url);
          roomOpen = w && target ? roomIsOpen(w.state, meeting.join_url) : null;
        }
        const decision = shouldJoinNow(meeting, new Date(), participantCount, roomOpen);
        if (!decision.join) {
          console.log(`prixie scheduler: ${meeting.title}: ${decision.reason}`);
          continue;
        }

        console.log(`prixie scheduler: deploying ${provider.name} bot for "${meeting.title}" (${meeting.platform})`);

        const bot = await provider.createBot(meeting, {
          realtimeWebhookUrl: this.realtimeWebhookUrl(),
        });

        // success is entry, not deployment (the owner, oct 22 2026). a bot
        // still knocking on a waiting room is bot_joining, not
        // bot_in_meeting, and prixie_attended flips only when the page
        // says she is in the call.
        const entered = bot.status === "in_meeting";
        await updateMeeting(meeting.id, {
          bot_id: bot.id,
          status: entered ? "bot_in_meeting" : "bot_joining",
          ...(entered ? { prixie_attended: true } : {}),
        });

        console.log(
          `prixie scheduler: bot ${bot.id} ${entered ? "entered" : "deployed, still waiting on entry"} meeting ${meeting.id}`,
        );
      } catch (err: any) {
        console.error(`prixie scheduler: failed to deploy for meeting ${meeting.id}:`, err);
        await updateMeeting(meeting.id, { status: "failed" }).catch(() => {});
      }
    }
  }

  private async checkActiveMeetingsStatus() {
    const active = await getActiveMeetings();
    if (active.length === 0) return;

    for (const meeting of active) {
      if (!meeting.bot_id) continue;

      try {
        const { status } = await provider.getStatus(meeting.bot_id);

        if (status === "error") {
          console.log(`prixie scheduler: meeting ${meeting.id} failed`);
          await updateMeeting(meeting.id, { status: "failed" });
          continue;
        }

        if (status === "in_meeting") {
          // keep the session from looking idle + send attendance once
          if (provider.heartbeat) await provider.heartbeat(meeting.bot_id);

          if (meeting.status !== "bot_in_meeting") {
            await updateMeeting(meeting.id, { status: "bot_in_meeting", prixie_attended: true });
          }

          await this.maybeSendAttendanceMessage(meeting);
          await this.maybeEnterAttendanceForm(meeting);
          await this.maybeRecordHost(meeting);
        }

        // session over, or meeting end time passed by a healthy margin
        const endedByTime =
          meeting.end_time &&
          new Date().getTime() > new Date(meeting.end_time).getTime() + END_GRACE_MINUTES * 60 * 1000;

        if (status === "ended" || endedByTime) {
          // a session that ran out while she never got in is a failure
          // with the story on it, never a quiet "completed" (the owner, oct
          // 22 2026: clicked ask to join is not success).
          if (meeting.status !== "bot_in_meeting" && !meeting.prixie_attended) {
            console.log(`prixie scheduler: meeting ${meeting.id} ended without her ever entering`);
            await updateMeeting(meeting.id, { status: "failed" });
            continue;
          }
          console.log(`prixie scheduler: meeting ${meeting.id} completed`);
          await updateMeeting(meeting.id, { status: "completed" });
        }
      } catch (err: any) {
        console.warn(`prixie scheduler: error checking status for ${meeting.bot_id}:`, err);
      }
    }
  }

  // attendance does not have to be a chat message: sometimes it is
  // entering an email into a form. she opens the form in her own session,
  // fills the owner's identity, submits, and keeps the screenshot receipt.
  // who is running the room (the owner, oct 21 2026): she reads the
  // participant list with roles once she is inside and records the
  // host's display name on the meeting. engines that cannot tell
  // leave it null: honest, never guessed. one read per meeting.
  private async maybeRecordHost(meeting: any) {
    if (meeting.host_name || meeting.host_read) return;
    try {
      const participants = provider.getParticipants
        ? await provider.getParticipants(meeting.bot_id!)
        : null;
      if (!participants) {
        // she could not tell (yet). mark read so the check is cheap but
        // retry once on a later pass: the list may populate late.
        if (meeting.host_retries >= 2) {
          await updateMeeting(meeting.id, { host_name: null, host_read: true } as any);
        } else {
          await updateMeeting(meeting.id, { host_retries: (meeting.host_retries || 0) + 1 } as any);
        }
        return;
      }
      const host = participants.find((p: any) => p.is_host) ||
        participants.find((p: any) => p.is_cohost);
      await updateMeeting(meeting.id, {
        host_name: host?.name || null,
        host_read: true,
      } as any);
      console.log(
        `prixie: room read for ${meeting.id}: ${participants.length} participants` +
          (host ? `, host is ${host.name}` : ", host role not visible"),
      );
    } catch (err: any) {
      console.warn(`prixie: host read failed in ${meeting.id}: ${err.message}`);
    }
  }

  private async maybeEnterAttendanceForm(meeting: any) {
    if (meeting.attendance_method !== "form" || meeting.attendance_messages_sent) return;
    if (!meeting.attendance_form_url) {
      console.warn(`prixie: form attendance for ${meeting.id} but no attendance_form_url`);
      return;
    }

    try {
      const verdict = await assertLinkSafe(meeting.attendance_form_url);
      if (!verdict.safe) {
        console.warn(`prixie: attendance form url blocked: ${verdict.reason}`);
        return;
      }

      const formEmail = await chooseFormEmail(null, meeting.attendance_form_url);
      if (!formEmail) {
        console.warn("prixie: form attendance skipped, no PRIXIE_FORM_EMAIL");
        return;
      }

      const receipt = await enterForm(meeting.attendance_form_url, {
        email: formEmail.address,
        name: Deno.env.get("PRIXIE_FORM_NAME") || "prixie",
      });
      const detail = receipt.submitted
        ? `form submitted: ${receipt.detail}`
        : `form entry failed: ${receipt.detail}`;

      await createAttendanceMessage({
        meeting_id: meeting.id,
        message_text: `form entry attempt for ${meeting.attendance_form_url}. ${detail}`,
        trigger: "on_join",
        sent_status: receipt.submitted ? "sent" : "failed",
        sent_at: new Date().toISOString(),
      });
      if (receipt.submitted) {
        await updateMeeting(meeting.id, { attendance_messages_sent: true });
      }
    } catch (err: any) {
      console.error(`prixie: attendance form entry failed in meeting ${meeting.id}`, err);
    }
  }

  private async maybeSendAttendanceMessage(meeting: any) {
    if (meeting.attendance_method !== "chat_message" || meeting.attendance_messages_sent) return;

    try {
      const messageText = meeting.attendance_form_url
        ? `hi! i am prixie, attending on behalf of my user. please sign attendance here: ${meeting.attendance_form_url}`
        : `hi! i am prixie, attending this meeting as a proxy agent for my user.`;

      const sent = await provider.sendChatMessage(meeting.bot_id, messageText);
      if (!sent) return;

      await createAttendanceMessage({
        meeting_id: meeting.id,
        message_text: messageText,
        trigger: "on_join",
        sent_status: "sent",
        sent_at: new Date().toISOString(),
      });
      await updateMeeting(meeting.id, { attendance_messages_sent: true });
    } catch (err: any) {
      console.error(`prixie: failed to send attendance chat message in meeting ${meeting.id}`, err);
    }
  }

  private async processCompletedTranscripts() {
    const completed = await getCompletedMeetingsWithoutTranscript();
    if (completed.length === 0) return;

    for (const meeting of completed) {
      if (!meeting.bot_id) continue;

      try {
        console.log(`prixie scheduler: fetching ${provider.name} transcript for meeting ${meeting.id}`);

        const transcript = await provider.getTranscript(meeting.bot_id);

        if (transcript.utterances) {
          // keyword search against pending capture requests
          const pendingCaptures = await getPendingCaptureRequestsByMeeting(meeting.id);
          for (const req of pendingCaptures) {
            const keywords = (req as any).keywords || [];
            if (keywords.length === 0) continue;
            const matches = searchForKeywords(transcript as any, keywords);
            if (matches.length > 0) {
              await updateCaptureRequest(req.id, {
                status: "captured",
                captured_content: matches.map((m: any) => `[${m.speaker || "unknown"}] ${m.text}`).join("\n"),
              });
            } else {
              await updateCaptureRequest(req.id, { status: "not_found" });
            }
          }
        } else {
          const pendingCaptures = await getPendingCaptureRequestsByMeeting(meeting.id);
          for (const req of pendingCaptures) {
            await updateCaptureRequest(req.id, { status: "not_found" });
          }
        }

        const rawTranscript = transcript.text;
        if (!rawTranscript || rawTranscript.trim().length === 0) {
          continue;
        }

        // hinglish processing: transliterate any devanagari to latin
        let processedTranscript = rawTranscript;
        let hinglishPercentage = 0;

        if (containsDevanagari(rawTranscript)) {
          console.log(`prixie scheduler: detected hinglish content in meeting ${meeting.id}, transliterating...`);
          processedTranscript = processTranscript(rawTranscript);
          const stats = hinglishStats(rawTranscript);
          hinglishPercentage = stats.hinglish_percentage;
          console.log(`prixie scheduler: hinglish content: ${stats.hinglish_percentage}% of transcript`);
        }

        // extract action items
        const actionItems: string[] = [];
        for (const line of rawTranscript.split("\n")) {
          const lower = line.toLowerCase();
          if (lower.includes("action item") || lower.includes("will do") || lower.includes("follow up") || lower.includes("todo")) {
            actionItems.push(line.trim());
          }
        }

        await createTranscript({
          meeting_id: meeting.id,
          full_transcript: processedTranscript,
          summary: transcript.summary || `meeting summary for ${meeting.title}. recorded ${rawTranscript.split("\n").length} transcript lines.`,
          action_items: actionItems,
        });

        await provider.destroy(meeting.bot_id).catch(() => {});

        console.log(`prixie scheduler: transcript completed for meeting ${meeting.id} (hinglish: ${hinglishPercentage}%)`);
      } catch (err: any) {
        console.error(`prixie scheduler: failed to retrieve transcript for meeting ${meeting.id}:`, err);
      }
    }
  }
}

export const meetingManager = new MeetingManager();
