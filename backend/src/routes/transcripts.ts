import { Hono } from "hono";
import { getTranscriptByMeetingId, getMeetingById } from "../services/supabase.ts";

const transcriptsRouter = new Hono();

/**
 * GET /api/transcripts/:meetingId
 * Get transcript, summary, and action items for a given meeting.
 * transcripts are produced by the scheduler once the meeting completes
 * (browserbase recording -> assembly.ai), so no live fetch path here.
 */
transcriptsRouter.get("/:meetingId", async (c) => {
  try {
    const meetingId = c.req.param("meetingId");

    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      return c.json({ error: "meeting not found" }, 404);
    }

    const transcript = await getTranscriptByMeetingId(meetingId);

    if (!transcript) {
      return c.json(
        {
          message: "no transcript recorded yet for this meeting",
          meeting_id: meetingId,
          meeting_status: meeting.status,
          transcript: null,
        },
        404
      );
    }

    return c.json({
      message: "transcript retrieved",
      meeting_id: meetingId,
      transcript,
    });
  } catch (err: any) {
    console.error(`prixie: error fetching transcript for meeting ${c.req.param("meetingId")}`, err);
    return c.json({ error: err.message || "failed to retrieve transcript" }, 500);
  }
});

export default transcriptsRouter;
