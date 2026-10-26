import { Hono } from "hono";
import {
  createMeeting,
  listMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  getCaptureRequestsByMeeting,
  getTranscriptByMeetingId,
} from "../services/supabase.ts";
import { MeetingStatus } from "../types.ts";

const meetingsRouter = new Hono();

/**
 * POST /api/meetings
 * Create a new meeting for prixie to attend or monitor
 */
meetingsRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();

    if (!body.title || !body.join_url || !body.start_time) {
      return c.json(
        { error: "missing required fields: title, join_url, and start_time are required" },
        400
      );
    }

    const meeting = await createMeeting({
      title: body.title,
      platform: body.platform,
      join_url: body.join_url,
      start_time: body.start_time,
      end_time: body.end_time,
      instruction: body.instruction,
      join_delay_minutes: body.join_delay_minutes !== undefined ? Number(body.join_delay_minutes) : 2,
      attendance_method: body.attendance_method || "none",
      attendance_form_url: body.attendance_form_url,
      zoom_user_email: body.zoom_user_email,
      voice_override: body.voice_override,
      localization: body.localization,
    });

    return c.json(
      {
        message: "meeting scheduled for prixie",
        meeting,
      },
      201
    );
  } catch (err: any) {
    console.error("prixie: error creating meeting", err);
    return c.json({ error: err.message || "failed to create meeting" }, 500);
  }
});

/**
 * GET /api/meetings
 * List all meetings with optional status filter
 */
meetingsRouter.get("/", async (c) => {
  try {
    const statusParam = c.req.query("status") as MeetingStatus | undefined;
    const meetings = await listMeetings(statusParam);

    return c.json({
      message: "meetings retrieved",
      count: meetings.length,
      meetings,
    });
  } catch (err: any) {
    console.error("prixie: error listing meetings", err);
    return c.json({ error: err.message || "failed to list meetings" }, 500);
  }
});

/**
 * GET /api/meetings/:id
 * Get details for a specific meeting, including capture requests and transcript
 */
meetingsRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const meeting = await getMeetingById(id);

    if (!meeting) {
      return c.json({ error: "meeting not found" }, 404);
    }

    const captureRequests = await getCaptureRequestsByMeeting(id);
    const transcript = await getTranscriptByMeetingId(id);

    return c.json({
      meeting,
      capture_requests: captureRequests,
      transcript: transcript || null,
    });
  } catch (err: any) {
    console.error(`prixie: error getting meeting ${c.req.param("id")}`, err);
    return c.json({ error: err.message || "failed to retrieve meeting" }, 500);
  }
});

/**
 * PATCH /api/meetings/:id or PUT /api/meetings/:id
 * Update meeting configuration
 */
const handleUpdate = async (c: any) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    const existing = await getMeetingById(id);
    if (!existing) {
      return c.json({ error: "meeting not found" }, 404);
    }

    const updated = await updateMeeting(id, body);
    return c.json({
      message: "meeting updated",
      meeting: updated,
    });
  } catch (err: any) {
    console.error(`prixie: error updating meeting ${c.req.param("id")}`, err);
    return c.json({ error: err.message || "failed to update meeting" }, 500);
  }
};

meetingsRouter.patch("/:id", handleUpdate);
meetingsRouter.put("/:id", handleUpdate);

/**
 * DELETE /api/meetings/:id
 * Delete a meeting
 */
/**
 * POST /api/meetings/:id/screenshare
 * The show-and-tell switch: start or stop her screenshare in a live
 * meeting. The microvm flow (or the owner, manually) drives it; she does
 * not share a screen in general, so nothing calls this on its own.
 */
/**
 * POST /api/meetings/:id/share-link
 * The show-and-tell with a url: start a link share (a deployed page,
 * a pitch deck, a site with nav), navigate or click inside the shared
 * page, or stop it. localhost / undeployed things stay the parked
 * microvm's job; nothing here shares a local screen.
 */
meetingsRouter.post("/:id/share-link", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const action = body?.action;
  if (!["start", "stop", "navigate", "click"].includes(action)) {
    return c.json({ error: "action must be 'start', 'stop', 'navigate' or 'click'" }, 400);
  }
  const meeting = await getMeetingById(c.req.param("id"));
  if (!meeting) return c.json({ error: "meeting not found" }, 404);
  if (!meeting.bot_id) return c.json({ error: "no live session for meeting" }, 409);

  const { botProvider } = await import("../services/browserbase_provider.ts");
  if (action === "start") {
    const fn = botProvider.startLinkShare;
    if (!fn) return c.json({ error: "provider cannot manage the link share" }, 501);
    if (!body?.url) return c.json({ error: "start needs a url" }, 400);
    // audio rides along when the page plays a video; audio: false is
    // the without-sound toggle
    const audio = body?.audio !== false;
    const ok = await fn.call(botProvider, meeting.bot_id, String(body.url), audio).catch(() => false);
    return c.json({ ok, action, meeting_id: meeting.id });
  }
  if (action === "navigate") {
    const fn = botProvider.navigateLinkShare;
    if (!fn) return c.json({ error: "provider cannot manage the link share" }, 501);
    if (!body?.url) return c.json({ error: "navigate needs a url" }, 400);
    const ok = await fn.call(botProvider, meeting.bot_id, String(body.url)).catch(() => false);
    return c.json({ ok, action, meeting_id: meeting.id });
  }
  if (action === "click") {
    const fn = botProvider.clickLinkShare;
    if (!fn) return c.json({ error: "provider cannot manage the link share" }, 501);
    if (!body?.selector && !body?.text) return c.json({ error: "click needs a selector or text" }, 400);
    const ok = await fn.call(botProvider, meeting.bot_id, body.selector, body.text).catch(() => false);
    return c.json({ ok, action, meeting_id: meeting.id });
  }
  const fn = botProvider.stopLinkShare;
  if (!fn) return c.json({ error: "provider cannot manage the link share" }, 501);
  const ok = await fn.call(botProvider, meeting.bot_id).catch(() => false);
  return c.json({ ok, action, meeting_id: meeting.id });
});

meetingsRouter.post("/:id/screenshare", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "start" && action !== "stop") {
    return c.json({ error: "action must be 'start' or 'stop'" }, 400);
  }
  const meeting = await getMeetingById(c.req.param("id"));
  if (!meeting) return c.json({ error: "meeting not found" }, 404);
  if (!meeting.bot_id) return c.json({ error: "no live session for meeting" }, 409);

  const { botProvider } = await import("../services/browserbase_provider.ts");
  const fn = action === "start" ? botProvider.startScreenshare : botProvider.stopScreenshare;
  if (!fn) return c.json({ error: "provider cannot manage screenshare" }, 501);
  const ok = await fn.call(botProvider, meeting.bot_id).catch(() => false);
  return c.json({ ok, action, meeting_id: meeting.id });
});

meetingsRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const existing = await getMeetingById(id);

    if (!existing) {
      return c.json({ error: "meeting not found" }, 404);
    }

    const success = await deleteMeeting(id);
    if (!success) {
      return c.json({ error: "failed to delete meeting" }, 500);
    }

    return c.json({ message: "meeting deleted successfully" });
  } catch (err: any) {
    console.error(`prixie: error deleting meeting ${c.req.param("id")}`, err);
    return c.json({ error: err.message || "failed to delete meeting" }, 500);
  }
});

export default meetingsRouter;
