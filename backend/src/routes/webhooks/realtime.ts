import { Hono } from "hono";
import {
  getMeetingByBotId,
  getPendingCaptureRequestsByMeeting,
  updateCaptureRequest,
} from "../../services/supabase.ts";
import { captureScreenshot } from "../../services/screenshots.ts";
import { registerDefaultScreenshotEngines } from "../../services/screenshot_engines.ts";
import { detectTerms } from "../../services/term_detector.ts";
import { notifyCaptureMatch } from "../../services/notify.ts";
import { detectScarcity } from "../../services/scarcity.ts";
import { redeemAndNotify } from "../../services/form_entry.ts";
import { extractPromoCode } from "../../services/promo.ts";
import {
  type QnaAskState,
  nextQnaAction,
  buildPermissionChatMessage,
  PERMISSION_SILENCE_MS,
} from "../../services/qna_flow.ts";
import { botProvider } from "../../services/browserbase_provider.ts";
import { createAttendanceMessage } from "../../services/supabase.ts";

// the door rule of this repo: unset secret = route closed, not open.
// whoever posts transcript/chat events (the recall webhook, a relay)
// carries the same secret in x-realtime-secret.
const realtimeWebhook = new Hono();

realtimeWebhook.use("*", async (c, next) => {
  const secret = Deno.env.get("REALTIME_WEBHOOK_SECRET");
  const provided = c.req.header("x-realtime-secret");
  if (!secret) {
    console.warn("prixie: REALTIME_WEBHOOK_SECRET is not set, the realtime door is CLOSED");
    return c.json({ error: "server not configured: set REALTIME_WEBHOOK_SECRET" }, 503);
  }
  if (provided !== secret) return c.json({ error: "unauthorized" }, 401);
  await next();
});

// scarcity she has heard per meeting (the announcement usually precedes
// the link by minutes). in-memory by design: it is live-call urgency,
// not durable truth. supabase keeps the capture.
const scarcityHeard = new Map<string, string>();

// the q&a ask flow state, per meeting (the owner, oct 21 2026). in-memory by
// the same design: live-call urgency, not durable truth. the capture
// request in supabase is the record. the camera is NEVER part of this
// flow: no branch turns it on, ever.
const qnaStates = new Map<string, QnaAskState>();

// drive the q&a ask flow with one observed event. returns nothing; the
// actions (chat sends, the out-loud ask) happen inside.
async function advanceQna(
  meeting: any,
  botId: string,
  kind: "transcript" | "chat",
  text: string,
  pendingCaptures: any[],
): Promise<void> {
  const state = qnaStates.get(meeting.id);
  let outcome = nextQnaAction(state, { kind, text });

  // silence deadline: she asked in chat, the q&a window is short, and
  // two minutes of no objection means she posts the question in the
  // chat, which is exactly what she asked permission for.
  if (state?.phase === "asked_permission" && outcome.action === "none" &&
      Date.now() - (state.permissionAskedAt || 0) > PERMISSION_SILENCE_MS) {
    outcome = { action: "post_question_in_chat" };
  }

  if (outcome.action === "open_window") {
    // only an ask-type request she has not yet had answered opens the
    // flow; other raised hands go first, she is not one of them.
    const ask = pendingCaptures.find((r) => r.type === "ask" && r.question);
    if (ask?.question) {
      qnaStates.set(meeting.id, {
        phase: "hands_up",
        pendingQuestionId: ask.id,
        question: ask.question,
      });
      console.log(`prixie: qna window open in ${meeting.id}, waiting for raised hands first`);
    }
    return;
  }

  if (outcome.action === "hands_clear" && state) {
    const sent = await botProvider.sendChatMessage(botId, buildPermissionChatMessage());
    if (sent) {
      state.phase = "asked_permission";
      state.permissionAskedAt = Date.now();
      await createAttendanceMessage({
        meeting_id: meeting.id,
        message_text: buildPermissionChatMessage(),
        sent_status: "sent",
        trigger: "qna",
      }).catch(() => {});
      console.log(`prixie: qna permission asked in chat in ${meeting.id}`);
    } else {
      // if she cannot even chat, she stands down; the request stays
      // pending and post-meeting transcript search still applies.
      state.phase = "done";
    }
    return;
  }

  if (outcome.action === "post_question_in_chat" && state) {
    const sent = await botProvider.sendChatMessage(botId, state.question);
    state.phase = sent ? "asked_in_chat" : "done";
    if (sent) {
      await createAttendanceMessage({
        meeting_id: meeting.id,
        message_text: state.question,
        sent_status: "sent",
        trigger: "qna",
      }).catch(() => {});
      console.log(`prixie: qna question posted in chat in ${meeting.id}`);
    }
    return;
  }

  if (outcome.action === "unmute_and_ask" && state) {
    // a human prompted her to speak: unmute and ask out loud, only
    // then. engines with no mic get the honest fallback: the question
    // still goes out, through the chat.
    const spoke = await (botProvider.unmuteAndSpeak?.(botId, state.question) ?? false);
    if (spoke) {
      state.phase = "asked_out_loud";
      console.log(`prixie: prompted to speak, unmuted and asked out loud in ${meeting.id}`);
    } else {
      const sent = await botProvider.sendChatMessage(botId, state.question);
      state.phase = sent ? "asked_in_chat" : "done";
      if (sent) console.log(`prixie: engine has no mic, question sent via chat in ${meeting.id}`);
    }
    return;
  }

  if (outcome.action === "stand_down" && state) {
    state.phase = "done";
    console.log(`prixie: qna ask declined in ${meeting.id}, standing down`);
  }
}

registerDefaultScreenshotEngines();

// generic realtime webhook. whatever engine prixie runs on (browserbase in-page
// chat monitor today, anything else later) pushes events here in a neutral shape:
//   { bot_id, kind: "chat" | "transcript", speaker?, text }

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

      // the q&a ask flow watches speech too: chat and meet go hand in
      // hand, and a spoken "sure prixie, go ahead" counts as much as a
      // chat reply.
      await advanceQna(meeting, botId, "transcript", text, pendingCaptures);

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

        // "this code is first come first serve" spoken in the call is the
        // trigger to escalate from notify to act
        if (req.redeem) {
          const scarcity = detectScarcity(text);
          if (scarcity.scarce) {
            scarcityHeard.set(meeting.id, `${speaker}: ${text}`);
            console.log(
              `prixie: scarcity heard in ${meeting.id}: ${scarcity.matched.join(", ")}`,
            );
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

          // an answered ask retires the q&a flow for this meeting
          if (req.type === "ask") {
            const st = qnaStates.get(meeting.id);
            if (st && st.pendingQuestionId === req.id) qnaStates.delete(meeting.id);
          }

          await updateCaptureRequest(req.id, {
            status: req.type === "ask" ? "answered" : "captured",
            captured_content: req.captured_content
              ? `${req.captured_content}\n${captureSnippet}`
              : captureSnippet,
            captured_screenshot_url: screenshotUrl || req.captured_screenshot_url || undefined,
            answer: req.type === "ask" ? text : req.answer,
          });

          // redemption-window case: a code that only works during the
          // meeting is useless in a post-meeting recap, so the owner
          // hears about it the moment she does.
          await notifyCaptureMatch({
            meetingTitle: meeting.title,
            captureTitle: req.title,
            snippet: captureSnippet,
            link: screenshotUrl,
            capturedAt: new Date(),
          }).catch(() => false);
        }
      }
    }

    if (kind === "chat") {
      const speaker = payload.speaker || "participant";
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/gi;
      const links = text.match(urlRegex) || [];

      // the q&a ask flow: a chat reply prompting her to speak up
      // unmutes her, only then.
      await advanceQna(meeting, botId, "chat", text, pendingCaptures);

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

          // a redeem-enabled request is the fcfs case: she enters the
          // owner's email herself in her own session (never the meeting
          // session) and pushes the receipt. fire-and-forget: the capture
          // in supabase is the record of truth.
          if (req.redeem && links.length > 0) {
            redeemAndNotify(links[0], {
              meetingTitle: meeting.title,
              captureTitle: req.title,
              scarce: scarcityHeard.get(meeting.id),
              promoCode: extractPromoCode(chatSnippet),
              emailMode: (req.form_email_mode as any) ?? null,
            }).catch((err: any) =>
              console.warn(`prixie: redeem attempt failed: ${err.message}`)
            );
          } else {
            // same instant push for chat: forms and links dropped mid-call
            // often close when the call does
            await notifyCaptureMatch({
              meetingTitle: meeting.title,
              captureTitle: req.title,
              snippet: chatSnippet,
              link: links[0],
              capturedAt: new Date(),
            }).catch(() => false);
          }
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
