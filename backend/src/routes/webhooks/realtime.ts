import { Hono } from "hono";
import {
  getMeetingByBotId,
  getPendingCaptureRequestsByMeeting,
  updateCaptureRequest,
} from "../../services/supabase.ts";
import { captureScreenshot } from "../../services/screenshots.ts";
import { registerDefaultScreenshotEngines } from "../../services/screenshot_engines.ts";
import { detectTerms } from "../../services/term_detector.ts";

registerDefaultScreenshotEngines();

// generic realtime webhook. whatever engine prixie runs on (browserbase in-page
// chat monitor today, anything else later) pushes events here in a neutral shape:
//   { bot_id, kind: "chat" | "transcript", speaker?, text }

const realtimeWebhook = new Hono();

realtimeWebhook.post("/", async (c) => {
  try {
    const payload = await c.req.json();
    const botId = payload.bot_id;
    const kind = payload.kind;
    const text = (payload.text || "").trim();

    console.log(`prixie: realtime webhook received "${kind}" event for bot ${botId || "unknown"}`);

    if (!botId || !text) {
      return c.json({ status: "acknowledged", note: "missing bot_id or text" });
    }

    const meeting = await getMeetingByBotId(botId);
    if (!meeting) {
      console.warn(`prixie: no meeting found for bot_id ${botId}`);
      return c.json({ status: "acknowledged", note: "meeting not found" });
    }

    const pendingCaptures = await getPendingCaptureRequestsByMeeting(meeting.id);
    if (pendingCaptures.length === 0) {
      return c.json({ status: "acknowledged", note: "no pending capture requests" });
    }

    if (kind === "transcript") {
      const speaker = payload.speaker || "speaker";
      const lowerText = text.toLowerCase();

      for (const req of pendingCaptures) {
        let matched = false;

        if (req.keywords && req.keywords.length > 0) {
          matched = req.keywords.some((kw) => kw && lowerText.includes(kw.toLowerCase()));
        }

        // a keyword-less capture request ("get me the access code") has no
        // watch words to fire on, so the term detector is the trigger: a
        // code-shaped or figure-shaped utterance is exactly the thing the
        // request was sent for. a keyword-less request that never hears one
        // honestly stays pending.
        if (!matched && req.type === "capture" && (!req.keywords || req.keywords.length === 0)) {
          const terms = detectTerms(text);
          matched = terms.some((t) => t.kind === "code" || t.kind === "math");
        }

        if (!matched && req.type === "ask" && req.question) {
          const questionWords = req.question.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          const matches = questionWords.filter((qw) => lowerText.includes(qw));
          if (matches.length >= Math.min(2, questionWords.length)) {
            matched = true;
          }
        }

        if (matched) {
          console.log(`prixie: keyword matched for capture request "${req.title}" in meeting ${meeting.id}`);
          const captureSnippet = `${speaker}: ${text}`;

          // a capture with screenshot_enabled grabs the frame at the
          // moment of the hit, through whichever engine rendered the
          // meeting. the pipeline does not know or care which.
          let screenshotUrl: string | undefined;
          if (req.screenshot_enabled && payload.session_id) {
            try {
              screenshotUrl = await captureScreenshot(payload.session_id, meeting.platform);
            } catch (err: any) {
              console.warn(`prixie: screenshot on capture failed: ${err.message}`);
            }
          }

          await updateCaptureRequest(req.id, {
            status: req.type === "ask" ? "answered" : "captured",
            captured_content: req.captured_content
              ? `${req.captured_content}\n${captureSnippet}`
              : captureSnippet,
            captured_screenshot_url: screenshotUrl || req.captured_screenshot_url || undefined,
            answer: req.type === "ask" ? text : req.answer,
          });
        }
      }
    }

    if (kind === "chat") {
      const speaker = payload.speaker || "participant";
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/gi;
      const links = text.match(urlRegex) || [];

      console.log(`prixie: chat message from ${speaker}: "${text}"`);

      for (const req of pendingCaptures) {
        if (!req.check_chat) continue;

        let matched = links.length > 0;
        if (!matched && req.keywords) {
          const lowerChat = text.toLowerCase();
          matched = req.keywords.some((kw) => kw && lowerChat.includes(kw.toLowerCase()));
        }

        if (matched) {
          const existingLinks = req.captured_chat_links || [];
          const newLinks = Array.from(new Set([...existingLinks, ...links]));

          const chatSnippet = `[chat] ${speaker}: ${text}`;

          await updateCaptureRequest(req.id, {
            status: "captured",
            captured_chat_links: newLinks,
            captured_content: req.captured_content
              ? `${req.captured_content}\n${chatSnippet}`
              : chatSnippet,
          });
        }
      }
    }

    return c.json({ status: "success", kind });
  } catch (err: any) {
    console.error("prixie: error processing realtime webhook", err);
    return c.json({ error: err.message || "webhook processing failed" }, 500);
  }
});

export default realtimeWebhook;
