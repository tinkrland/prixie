import {
  getScheduledUpcomingMeetings,
  getActiveMeetings,
  getCompletedMeetingsWithoutTranscript,
  updateMeeting,
  createTranscript,
  getPendingCaptureRequestsByMeeting,
  updateCaptureRequest,
} from "../services/supabase.ts";
import { recallService } from "../services/recall.ts";

export class MeetingManager {
  private isRunning = false;

  /**
   * Start the recurring meeting manager cron job
   */
  public startScheduler(intervalMs = 60000) {
    if (this.isRunning) {
      console.log("prixie: meeting manager scheduler is already running");
      return;
    }

    this.isRunning = true;
    console.log(`prixie: starting meeting manager scheduler (interval: ${intervalMs / 1000}s)`);

    // Run immediately on startup
    this.runCycle();

    // Set recurring timer
    setInterval(() => {
      this.runCycle();
    }, intervalMs);
  }

  /**
   * Run one complete management cycle
   */
  public async runCycle() {
    try {
      await this.deployUpcomingBots();
      await this.checkActiveMeetingsStatus();
      await this.processCompletedTranscripts();
    } catch (err: any) {
      console.error("prixie: error during meeting manager scheduler cycle:", err);
    }
  }

  /**
   * Step 1: Find meetings starting within 5 minutes and deploy bots
   */
  private async deployUpcomingBots() {
    const upcoming = await getScheduledUpcomingMeetings(5);
    if (upcoming.length === 0) return;

    console.log(`prixie: found ${upcoming.length} upcoming meeting(s) to deploy`);

    for (const meeting of upcoming) {
      try {
        if (meeting.bot_id && (meeting.status === "bot_joining" || meeting.status === "bot_in_meeting")) {
          continue;
        }

        console.log(`prixie scheduler: deploying bot for meeting "${meeting.title}" (${meeting.id})`);
        const botData = await recallService.createBot(meeting);

        await updateMeeting(meeting.id, {
          bot_id: botData.id,
          status: "bot_joining",
        });

        console.log(`prixie scheduler: bot ${botData.id} deployed for meeting ${meeting.id}`);
      } catch (err: any) {
        console.error(`prixie scheduler: failed to deploy bot for meeting ${meeting.id}:`, err);
      }
    }
  }

  /**
   * Step 2: Check status of active meetings with deployed bots
   */
  private async checkActiveMeetingsStatus() {
    const active = await getActiveMeetings();
    if (active.length === 0) return;

    for (const meeting of active) {
      if (!meeting.bot_id) continue;

      try {
        const bot = await recallService.getBot(meeting.bot_id);
        const statusChanges = bot.status_changes || [];
        const latestStatus = statusChanges[statusChanges.length - 1]?.code || bot.status;

        if (latestStatus === "in_call" && meeting.status !== "bot_in_meeting") {
          console.log(`prixie scheduler: meeting ${meeting.id} active in call`);
          await updateMeeting(meeting.id, { status: "bot_in_meeting", prixie_attended: true });
        } else if (
          (latestStatus === "call_ended" || latestStatus === "recording_done" || latestStatus === "done") &&
          meeting.status !== "completed"
        ) {
          console.log(`prixie scheduler: meeting ${meeting.id} completed`);
          await updateMeeting(meeting.id, { status: "completed" });
        } else if (latestStatus === "fatal") {
          console.log(`prixie scheduler: meeting ${meeting.id} failed`);
          await updateMeeting(meeting.id, { status: "failed" });
        }
      } catch (err: any) {
        console.warn(`prixie scheduler: error checking bot status for ${meeting.bot_id}:`, err);
      }
    }
  }

  /**
   * Step 3: Retrieve transcripts from completed meetings without recorded transcript
   */
  private async processCompletedTranscripts() {
    const completed = await getCompletedMeetingsWithoutTranscript();
    if (completed.length === 0) return;

    for (const meeting of completed) {
      if (!meeting.bot_id) continue;

      try {
        console.log(`prixie scheduler: fetching transcript for completed meeting ${meeting.id}`);
        const rawTranscript = await recallService.getBotTranscript(meeting.bot_id);

        if (rawTranscript && rawTranscript.trim().length > 0 && rawTranscript !== "no transcript recorded") {
          const summary = `meeting summary for ${meeting.title}. recorded ${rawTranscript.split("\n").length} transcript lines.`;

          const actionItems: string[] = [];
          for (const line of rawTranscript.split("\n")) {
            const lower = line.toLowerCase();
            if (
              lower.includes("action item") ||
              lower.includes("will do") ||
              lower.includes("follow up") ||
              lower.includes("todo")
            ) {
              actionItems.push(line.trim());
            }
          }

          await createTranscript({
            meeting_id: meeting.id,
            full_transcript: rawTranscript,
            summary,
            action_items: actionItems,
          });

          // Clear remaining pending capture requests as not_found
          const pendingCaptures = await getPendingCaptureRequestsByMeeting(meeting.id);
          for (const req of pendingCaptures) {
            await updateCaptureRequest(req.id, { status: "not_found" });
          }

          console.log(`prixie scheduler: completed transcript retrieval for meeting ${meeting.id}`);
        }
      } catch (err: any) {
        console.error(`prixie scheduler: failed to retrieve transcript for meeting ${meeting.id}:`, err);
      }
    }
  }
}

export const meetingManager = new MeetingManager();
