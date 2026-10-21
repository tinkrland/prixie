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

        console.log(`prixie scheduler: deploying ${provider.name} bot for "${meeting.title}" (${meeting.platform})`);

        const bot = await provider.createBot(meeting, {
          realtimeWebhookUrl: this.realtimeWebhookUrl(),
        });

        await updateMeeting(meeting.id, {
          bot_id: bot.id,
          status: "bot_in_meeting",
          prixie_attended: true,
        });

        console.log(`prixie scheduler: bot ${bot.id} joined meeting ${meeting.id}`);
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
          await provider.heartbeat(meeting.bot_id);

          if (meeting.status !== "bot_in_meeting") {
            await updateMeeting(meeting.id, { status: "bot_in_meeting", prixie_attended: true });
          }

          await this.maybeSendAttendanceMessage(meeting);
        }

        // session over, or meeting end time passed by a healthy margin
        const endedByTime =
          meeting.end_time &&
          new Date().getTime() > new Date(meeting.end_time).getTime() + END_GRACE_MINUTES * 60 * 1000;

        if (status === "ended" || endedByTime) {
          console.log(`prixie scheduler: meeting ${meeting.id} completed`);
          await updateMeeting(meeting.id, { status: "completed" });
        }
      } catch (err: any) {
        console.warn(`prixie scheduler: error checking status for ${meeting.bot_id}:`, err);
      }
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
