import { Hono } from "hono";
import { cors } from "hono/cors";

import meetingsRouter from "./routes/meetings.ts";
import captureRouter from "./routes/capture.ts";
import transcriptsRouter from "./routes/transcripts.ts";
import deployRouter from "./routes/deploy.ts";
import profilesRouter from "./routes/profiles.ts";
import statsRouter from "./routes/stats.ts";
import browserbaseRouter from "./routes/browserbase.ts";
import lumaRouter from "./routes/luma.ts";
import calendlyRouter from "./routes/calendly.ts";

import recallRealtimeWebhook from "./routes/webhooks/recall_realtime.ts";
import recallStatusWebhook from "./routes/webhooks/recall_status.ts";
import googleCalendarWebhook from "./routes/webhooks/google_calendar.ts";

import { meetingManager } from "./scheduler/meeting_manager.ts";

const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// health check
app.get("/", (c) => {
  return c.json({
    name: "prixie",
    status: "ok",
    message: "prixie is online and standing by for meetings",
    timestamp: new Date().toISOString(),
  });
});

// api routes
app.route("/api/meetings", meetingsRouter);
app.route("/api/capture", captureRouter);
app.route("/api/transcripts", transcriptsRouter);
app.route("/api/deploy", deployRouter);
app.route("/api/profiles", profilesRouter);
app.route("/api/stats", statsRouter);
app.route("/api/browserbase", browserbaseRouter);
app.route("/api/luma", lumaRouter);
app.route("/api/calendly", calendlyRouter);

// nested: POST /api/meetings/:id/capture
app.post("/api/meetings/:id/capture", async (c) => {
  const meetingId = c.req.param("id");
  const body = await c.req.json();
  const reqWithMeetingId = { ...body, meeting_id: meetingId };
  const request = new Request(c.req.raw.url, {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify(reqWithMeetingId),
  });
  return app.fetch(request);
});

// webhooks
app.route("/webhooks/recall/realtime", recallRealtimeWebhook);
app.route("/webhooks/recall/status", recallStatusWebhook);
app.route("/webhooks/google-calendar", googleCalendarWebhook);

// scheduler
const enableScheduler = Deno.env.get("ENABLE_SCHEDULER") !== "false";
if (enableScheduler) {
  meetingManager.startScheduler(60000);
} else {
  console.log("prixie: meeting manager scheduler disabled");
}

const port = Number(Deno.env.get("PORT")) || 8000;
console.log(`prixie server running on port ${port}`);

Deno.serve({ port }, app.fetch);

export default app;
