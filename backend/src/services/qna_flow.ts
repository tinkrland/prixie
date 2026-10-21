// the q&a ask flow (the owner, oct 21 2026): prixie has a pending question
// and the meeting never enabled the q&a panel. the flow, in her words:
//
//   1. she waits for the "any questions?" moment and lets raised hands
//      go first. mid-meeting barging is NOT this flow (assembly.ai owns
//      that, later).
//   2. when hands are done, she asks IN THE CHAT whether she can drop
//      her question there, because q&a isn't enabled. chat and speech
//      go hand in hand, so both channels are watched for the answer.
//   3. only if someone prompts her to speak up (chat reply or spoken,
//      both count) does she unmute and ask out loud. prompted only,
//      never on her own.
//   4. the camera never comes on. she cannot think of a reason it would
//      need to, so there is no camera branch in this flow at all.
//
// all detectors are pure and tested; the state lives with the caller
// (in-memory per meeting, same as scarcity: it is live-call urgency,
// not durable truth. supabase keeps the capture request).

export type QnaPhase =
  | "idle" // no question window yet
  | "hands_up" // window open, raised hands going first
  | "asked_permission" // she asked in chat, waiting on a human
  | "asked_out_loud" // prompted, unmuted, question asked, listening
  | "asked_in_chat" // question posted in chat, listening
  | "done" // answered, declined, or window gone
  ;

export interface QnaAskState {
  phase: QnaPhase;
  pendingQuestionId: string;
  question: string;
  // when she sent the permission ask; silence past the deadline means
  // she posts the question in chat anyway (that is what she asked for,
  // and the window is closing)
  permissionAskedAt?: number;
}

export type QnaOutcome =
  | { action: "none" }
  | { action: "open_window" } // any-questions moment; hands go first
  | { action: "hands_clear" } // raised hands done, her turn to ask via chat
  | { action: "send_permission_chat" } // post the "q&a off, can i ask in chat?" message
  | { action: "post_question_in_chat" } // allowed in chat / silence: type it
  | { action: "unmute_and_ask" } // prompted to speak: unmute, ask out loud
  | { action: "stand_down" } // declined or window gone; back to listening
  ;

// the first "any questions?" opens the window. she does NOT jump here:
// raised hands go first, by design.
const WINDOW_PATTERNS = [
  /any (questions|q&a|question for)/i,
  /questions for (me|us|the)/i,
  /raise (your|their) hand/i,
  /open (the )?floor/i,
  /(do|does) (anyone|anybody|you all|you guys) have (any )?questions/i,
  /we (have|have got) time for questions/i,
  /question[s]? and answer/i,
];

// the patterns that mean the raised hands are done: a SECOND ask, a
// last call, or a wrap-up. this is her moment.
const HANDS_CLEAR_PATTERNS = [
  /any (more|other|last) questions?/i,
  /anyone else/i,
  /no more questions/i,
  /last (call|chance) for questions/i,
  /final questions?/i,
  /that('?s| is) all (the|our|our for) questions?/i,
  /(alright|okay|ok)[, ]+(so )?(that'?s|that is) all/, // wrap-up
  /before we (wrap|close|end)/i,
  /(last|final) (thing|question)/i,
  /we('?re| are) (at|almost at|running out of) time/i,
  /let'?s wrap/i,
];

// responses to her permission ask. speak invitations are explicit;
// plain affirmatives mean chat is fine. negatives stand her down.
const SPEAK_INVITE_PATTERNS = [
  /\bunmute\b/i,
  /go ahead and ask/i,
  /ask away/i,
  /(ask|say|talk).{0,12}(out loud|verbally|out loud)/i,
  /feel free to (ask|speak|talk|unmute)/i,
  /you (can|could|might want to) (ask|speak|talk)/i,
  /(yes|yeah|sure|of course)[, ]*(prixie)?[, ]*you (can|could) unmute/i,
  /(yes|yeah|sure|of course)[, ]*(prixie)?[, ]*say it/i,
  /jump in/i,
  /take yourself off mute/i,
];

const CHAT_OK_PATTERNS = [
  /^(yes|yeah|yep|sure|of course|absolutely|please do|go ahead|go for it|yes please|certainly)\b/i,
  /(drop|put|type|send|put) it (in|into) (the )?(chat|channel|comments)/i,
  /(chat is fine|in chat|via chat|in the chat works)/i,
];

const DECLINE_PATTERNS = [
  /^(no|nah|nope)\b/i,
  /not now/i,
  /hold on/i,
  /hold (your|that) question/i,
  /maybe (later|after)/i,
  /let'?s move on/i,
  /(email|dm|message) (me|us) (instead|after|later)/i,
  /we'?re (at|out of) time/i,
];

// pure: did the meeting open a question window?
export function detectQuestionWindow(text: string): boolean {
  return WINDOW_PATTERNS.some((p) => p.test(text));
}

// pure: are raised hands done? (second ask / last call / wrap-up)
export function detectHandsClear(text: string): boolean {
  return HANDS_CLEAR_PATTERNS.some((p) => p.test(text));
}

export type QnaResponse = "speak_invitation" | "chat_ok" | "declined" | "unrelated";

// pure: interpret a chat reply or spoken utterance that arrives while
// she is waiting on permission. chat and speech go hand in hand, so
// the same interpretation serves both channels.
export function interpretResponse(text: string): QnaResponse {
  if (SPEAK_INVITE_PATTERNS.some((p) => p.test(text))) return "speak_invitation";
  if (DECLINE_PATTERNS.some((p) => p.test(text))) return "declined";
  if (CHAT_OK_PATTERNS.some((p) => p.test(text))) return "chat_ok";
  return "unrelated";
}

// her permission ask in the chat. lowercase, honest about why.
export function buildPermissionChatMessage(): string {
  return "quick question: the q&a isn't enabled here, so is it okay if i drop a question in the chat? happy to unmute and ask out loud if that's easier";
}

// pure: the state transitions. each call is one event observed.
export function nextQnaAction(
  state: QnaAskState | undefined,
  event:
    | { kind: "transcript"; text: string }
    | { kind: "chat"; text: string }
    | { kind: "permission_sent" }
    | { kind: "silence_deadline"; nowMs: number }
    | { kind: "answered" },
): QnaOutcome {
  // no state yet: only a question window creates one, and only if the
  // caller already knows there is a pending question to ask.
  if (!state || state.phase === "done") {
    if (event.kind === "transcript" && detectQuestionWindow(event.text)) {
      return { action: "open_window" };
    }
    return { action: "none" };
  }

  if (state.phase === "hands_up") {
    if (event.kind === "transcript" && detectHandsClear(event.text)) {
      return { action: "hands_clear" };
    }
    return { action: "none" };
  }

  if (state.phase === "asked_permission") {
    if (event.kind === "chat" || event.kind === "transcript") {
      const response = interpretResponse(event.text);
      if (response === "speak_invitation") return { action: "unmute_and_ask" };
      if (response === "chat_ok") return { action: "post_question_in_chat" };
      if (response === "declined") return { action: "stand_down" };
      return { action: "none" };
    }
    if (event.kind === "silence_deadline") {
      // she asked, nobody objected, the window is closing: post it in
      // the chat, which is exactly what she asked permission for.
      return { action: "post_question_in_chat" };
    }
    return { action: "none" };
  }

  // asked_out_loud / asked_in_chat: she is listening for the answer;
  // the existing ask-capture machinery marks the request answered.
  return { action: "none" };
}

// silence window for the permission ask (ms). she is polite but the
// q&a moment is short: two minutes of no objection and she posts.
export const PERMISSION_SILENCE_MS = 120_000;
