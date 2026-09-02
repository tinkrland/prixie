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
import { joinMeeting, getSessionStatus, stopSession } from "../services/browserbase.ts";
import { transcribeBrowserbaseSession, searchForKeywords } from "../services/browserbase_transcript.ts";

const BROWSERBASE_PLATFORMS = ["discord", "bluejeans", "ringcentral", "custom"];

function needsBrowserbase(platform: string): boolean {
  return BROWSERBASE_PLATFORMS.includes(platform);
}

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

  /**
   * Step 1: deploy bots for upcoming meetings
   * dispatches to recall.ai or browserbase depending on platform
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

        if (needsBrowserbase(meeting.platform)) {
          // browserbase path
          console.log(`prixie scheduler: deploying browserbase for "${meeting.title}" (${meeting.platform})`);

          let profileName = "prixie";
          if (meeting.profile_id) {
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
            if (profile?.display_name) profileName = profile.display_name;
          }

          const result = await joinMeeting(meeting.platform, meeting.join_url, profileName);

          if (result.status === "joined") {
            await updateMeeting(meeting.id, {
              bot_id: result.session_id,
              status: "bot_in_meeting",
              prixie_attended: true,
            });
            console.log(`prixie scheduler: browserbase session ${result.session_id} joined meeting ${meeting.id}`);
          } else {
            await updateMeeting(meeting.id, { status: "failed" });
            console.error(`prixie scheduler: browserbase join failed for meeting ${meeting.id}: ${result.error}`);
          }
        } else {
          // recall.ai path
          console.log(`prixie scheduler: deploying recall.ai bot for "${meeting.title}" (${meeting.platform})`);
          const botData = await recallService.createBot(meeting);

          await updateMeeting(meeting.id, {
            bot_id: botData.id,
            status: "bot_joining",
          });

          console.log(`prixie scheduler: bot ${botData.id} deployed for meeting ${meeting.id}`);
        }
      } catch (err: any) {
        console.error(`prixie scheduler: failed to deploy for meeting ${meeting.id}:`, err);
      }
    }
  }

  /**
   * Step 2: check status of active meetings
   * uses recall.ai or browserbase depending on platform
   */
  private async checkActiveMeetingsStatus() {
    const active = await getActiveMeetings();
    if (active.length === 0) return;

    for (const meeting of active) {
      if (!meeting.bot_id) continue;

      try {
        if (needsBrowserbase(meeting.platform)) {
          // browserbase status check
          const sessionStatus = await getSessionStatus(meeting.bot_id);
          const status = sessionStatus?.status || sessionStatus?.state || "unknown";

          if (status === "completed" || status === "terminated" || status === "closed") {
            console.log(`prixie scheduler: browserbase meeting ${meeting.id} completed`);
            await updateMeeting(meeting.id, { status: "completed" });
          } else if (status === "error" || status === "failed") {
            console.log(`prixie scheduler: browserbase meeting ${meeting.id} failed`);
            await updateMeeting(meeting.id, { status: "failed" });
          }
          // for browserbase, the session stays alive as long as the meeting is running
          // we detect meeting end by session termination or timeout
        } else {
          // recall.ai status check
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
        }
      } catch (err: any) {
        console.warn(`prixie scheduler: error checking status for ${meeting.bot_id}:`, err);
      }
    }
  }

  /**
   * Step 3: retrieve transcripts for completed meetings
   * uses recall.ai or browserbase + assembly.ai depending on platform
   */
  private async processCompletedTranscripts() {
    const completed = await getCompletedMeetingsWithoutTranscript();
    if (completed.length === 0) return;

    for (const meeting of completed) {
      if (!meeting.bot_id) continue;

      try {
        if (needsBrowserbase(meeting.platform)) {
          // browserbase transcription path
          console.log(`prixie scheduler: fetching browserbase transcript for meeting ${meeting.id}`);

          const transcript = await transcribeBrowserbaseSession(meeting.bot_id);

          if (transcript.text && transcript.text.length > 0) {
            // search for keywords from capture requests
            const pendingCaptures = await getPendingCaptureRequestsByMeeting(meeting.id);

            for (const req of pendingCaptures) {
              const keywords = (req as any).keywords || [];
              if (keywords.length === 0) continue;

              const matches = searchForKeywords(transcript, keywords);
              if (matches.length > 0) {
                await updateCaptureRequest(req.id, {
                  status: "captured",
                  captured_content: matches.map((m: any) =>
                    `[${m.speaker || "unknown"}] ${m.text}`
                  ).join("\n"),
                });
              } else {
                await updateCaptureRequest(req.id, { status: "not_found" });
              }
            }

            await createTranscript({
              meeting_id: meeting.id,
              full_transcript: transcript.text,
              summary: transcript.summary,
            });

            // stop the browserbase session
            await stopSession(meeting.bot_id);

            console.log(`prixie scheduler: browserbase transcript completed for meeting ${meeting.id}`);
          }
        } else {
          // recall.ai transcription path
          console.log(`prixie scheduler: fetching recall.ai transcript for meeting ${meeting.id}`);
          const rawTranscript = await recallService.getBotTranscript(meeting.bot_id);

          if (rawTranscript && rawTranscript.trim().length > 0 && rawTranscript !== "no transcript recorded") {
            const summary = `meeting summary for ${meeting.title}. recorded ${rawTranscript.split("\n").length} transcript lines.`;

            const actionItems: string[] = [];
            for (const line of rawTranscript.split("\n")) {
              const lower = line.toLowerCase();
              if (lower.includes("action item") || lower.includes("will do") || lower.includes("follow up") || lower.includes("todo")) {
                actionItems.push(line.trim());
              }
            }

            await createTranscript({
              meeting_id: meeting.id,
              full_transcript: rawTranscript,
              summary,
              action_items: actionItems,
            });

            const pendingCaptures = await getPendingCaptureRequestsByMeeting(meeting.id);
            for (const req of pendingCaptures) {
              await updateCaptureRequest(req.id, { status: "not_found" });
            }

            console.log(`prixie scheduler: recall.ai transcript completed for meeting ${meeting.id}`);
          }
        }
      } catch (err: any) {
        console.error(`prixie scheduler: failed to retrieve transcript for meeting ${meeting.id}:`, err);
      }
    }
  }
}

export const meetingManager = new MeetingManager();
