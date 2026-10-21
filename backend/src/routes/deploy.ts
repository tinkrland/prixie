import { Hono } from "hono";
import { getMeetingById, updateMeeting } from "../services/supabase.ts";
import { botProvider } from "../services/browserbase_provider.ts";

const deployRouter = new Hono();

/**
 * POST /api/deploy/:meetingId
 * Manually deploy prixie to a specific meeting (browserbase join)
 */
deployRouter.post("/:meetingId", async (c) => {
  try {
    const meetingId = c.req.param("meetingId");

    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      return c.json({ error: "meeting not found" }, 404);
    }

    if (meeting.status === "bot_in_meeting" || meeting.status === "bot_joining") {
      return c.json(
        {
          message: "prixie is already deployed or joining this meeting",
          bot_id: meeting.bot_id,
          status: meeting.status,
        },
        200
      );
    }

    const baseUrl = Deno.env.get("BASE_URL") || Deno.env.get("WEBHOOK_URL") || "https://prixie.yourdomain.com";
    const realtimeWebhook = `${baseUrl}/webhooks/realtime`;

    // Deploy bot via the active provider (browserbase)
    const bot = await botProvider.createBot(meeting, { realtimeWebhookUrl: realtimeWebhook });

    const updatedMeeting = await updateMeeting(meetingId, {
      bot_id: bot.id,
      status: "bot_in_meeting",
      prixie_attended: true,
    });

    return c.json({
      message: "prixie deployed to meeting successfully",
      bot_id: bot.id,
      meeting: updatedMeeting,
      provider: botProvider.name,
    });
  } catch (err: any) {
    console.error(`prixie: deployment error for meeting ${c.req.param("meetingId")}`, err);
    return c.json({ error: err.message || "failed to deploy prixie to meeting" }, 500);
  }
});

export default deployRouter;
