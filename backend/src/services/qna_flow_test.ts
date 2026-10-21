// q&a ask flow tests (the owner, oct 21 2026): raised hands first, chat
// permission before out-loud asking, prompt-gated unmute, camera never.

import { assertEquals } from "jsr:@std/assert@1";
import {
  detectQuestionWindow,
  detectHandsClear,
  interpretResponse,
  buildPermissionChatMessage,
  nextQnaAction,
  type QnaAskState,
} from "./qna_flow.ts";

Deno.test("the question window opens on the ask-out patterns", () => {
  assertEquals(detectQuestionWindow("does anyone have any questions for our presenter?"), true);
  assertEquals(detectQuestionWindow("raise your hand if you have a question"), true);
  assertEquals(detectQuestionWindow("we have time for questions if anyone wants"), true);
  assertEquals(detectQuestionWindow("so today we are going to cover chapter three"), false);
});

Deno.test("hands clear on the second ask / last call / wrap-up", () => {
  assertEquals(detectHandsClear("any more questions? no? alright"), true);
  assertEquals(detectHandsClear("last call for questions"), true);
  assertEquals(detectHandsClear("okay so that's all, before we wrap up"), true);
  assertEquals(detectHandsClear("anyone else have one?"), true);
  // the FIRST ask is not her moment; that is hands going up
  assertEquals(detectHandsClear("does anyone have any questions"), false);
});

Deno.test("responses split: speak invitations vs chat-ok vs decline", () => {
  assertEquals(interpretResponse("sure prixie, go ahead and ask"), "speak_invitation");
  assertEquals(interpretResponse("yes you can unmute and ask"), "speak_invitation");
  assertEquals(interpretResponse("feel free to ask out loud"), "speak_invitation");
  assertEquals(interpretResponse("yeah, sure"), "chat_ok");
  assertEquals(interpretResponse("drop it in the chat"), "chat_ok");
  assertEquals(interpretResponse("not now, hold on"), "declined");
  assertEquals(interpretResponse("email me instead"), "declined");
  assertEquals(interpretResponse("so chapter three covers..."), "unrelated");
});

Deno.test("the permission chat message says why, offers the mic, and addresses the host when she knows", () => {
  const msg = buildPermissionChatMessage();
  assertEquals(msg.includes("q&a isn't enabled"), true);
  assertEquals(msg.includes("chat"), true);
  assertEquals(msg.includes("unmute"), true);

  const toHost = buildPermissionChatMessage("priya");
  assertEquals(toHost.startsWith("hey priya, quick question"), true);
  assertEquals(buildPermissionChatMessage(null).startsWith("quick question"), true);
});

const state = (phase: QnaAskState["phase"], at?: number): QnaAskState => ({
  phase,
  pendingQuestionId: "cr_1",
  question: "will the recording be shared afterwards?",
  permissionAskedAt: at,
});

Deno.test("the full arc: window, hands, permission, prompt, speak", () => {
  // no state: transcript opens the window
  assertEquals(nextQnaAction(undefined, { kind: "transcript", text: "any questions?" }).action, "open_window");

  // hands up: the first ask is not her moment
  const hands = state("hands_up");
  assertEquals(nextQnaAction(hands, { kind: "transcript", text: "does anyone have questions" }).action, "none");
  // the second ask clears her path
  assertEquals(nextQnaAction(hands, { kind: "transcript", text: "any more questions for us?" }).action, "hands_clear");

  // waiting on permission: unrelated chatter does nothing
  const asked = state("asked_permission", Date.now());
  assertEquals(nextQnaAction(asked, { kind: "chat", text: "the slides are up" }).action, "none");
  // a chat reply prompting her to speak unmutes her
  assertEquals(nextQnaAction(asked, { kind: "chat", text: "sure prixie, go ahead and ask out loud" }).action, "unmute_and_ask");
  // a plain yes means chat
  assertEquals(nextQnaAction(asked, { kind: "transcript", text: "yeah sure, put it in the chat" }).action, "post_question_in_chat");
  // a decline stands her down
  assertEquals(nextQnaAction(asked, { kind: "chat", text: "not now, we're at time" }).action, "stand_down");

  // silence past the deadline: she posts the question in chat anyway
  const silent = state("asked_permission", Date.now() - 121_000);
  assertEquals(nextQnaAction(silent, { kind: "silence_deadline", nowMs: Date.now() }).action, "post_question_in_chat");
});

Deno.test("once she is asking or done, only a brand new window reopens the flow", () => {
  const askedLoud = state("asked_out_loud");
  assertEquals(nextQnaAction(askedLoud, { kind: "transcript", text: "any questions?" }).action, "none");
  const done = state("done");
  assertEquals(nextQnaAction(done, { kind: "transcript", text: "any questions?" }).action, "open_window");
});
