// reactions + raise hand + screensharing awareness (the owner, oct 27 2026).
// the dom paths are cdp expressions, so the structural tests pin the
// contract on them: the exact aria-labels google's meet docs give,
// the never-lower-hand rule, the host-disabled honesty, and the viewer
// indicators the sharer reader matches. the pure helpers test directly.

import { assertEquals } from "jsr:@std/assert@1";
import {
  MEET_REACTIONS,
  injectCdpSend,
  resetCdpSend,
  getActiveScreensharerInSession,
  normalizeReaction,
  raiseHandInSession,
  reactInSession,
} from "./browserbase.ts";
import { sharerToSignal } from "./voice_agent.ts";

Deno.test("reaction names: only the names meet's tray actually gives", () => {
  // the names are google's own (verified against the meet docs); an
  // unknown name is refused, never approximated to a close emoji
  assertEquals(MEET_REACTIONS.includes("thumbs up"), true);
  assertEquals(MEET_REACTIONS.includes("party popper"), true);
  assertEquals(normalizeReaction("  Thumbs Up "), "thumbs up");
  assertEquals(normalizeReaction("thumbs up"), "thumbs up");
  assertEquals(normalizeReaction("fire"), null);
  assertEquals(normalizeReaction(""), null);
});

Deno.test("the reaction walk: tray by its aria-label, emoji by its own name, host-disabled is honest", async () => {
  // unknown emoji: refused before any cdp call
  assertEquals(await reactInSession("fake-session", "fire"), false);

  // the seam first: the hosted sdk page implements prixieReact
  let lastExpression = "";
  injectCdpSend(async (_sid, method, params) => {
    if (method === "Runtime.evaluate") {
      lastExpression = params.expression;
      if (params.expression.includes("prixieScreensharer")) return { result: { result: { value: JSON.stringify({ name: null }) } } };
      if (params.expression.includes("prixieReact")) return { result: { result: { value: "seam" } } };
      return { result: { result: { value: "reacted" } } };
    }
    return {};
  });
  const restore = () => resetCdpSend();
  try {
    assertEquals(await reactInSession("fake-session", "thumbs up"), true);
    assertEquals(lastExpression.includes("window.prixieReact"), true);
    assertEquals(lastExpression.includes("Send a reaction"), true);
    assertEquals(lastExpression.includes("aria-disabled"), true);
    // the emoji name rides the expression, escaped
    assertEquals(lastExpression.includes('"thumbs up"'), true);
  } finally {
    resetCdpSend();
  }
});

Deno.test("raise hand: never puts her own hand down, host-disabled is honest", async () => {
  let lastExpression = "";
  injectCdpSend(async (_sid, _method, params) => {
    lastExpression = params.expression;
    return { result: { result: { value: "raised" } } };
  });
  const restore = () => resetCdpSend();
  try {
    assertEquals(await raiseHandInSession("fake-session"), true);
    assertEquals(lastExpression.includes("prixieRaiseHand"), true);
    // the lower button is found but NEVER clicked: an already-up hand
    // is the goal state
    assertEquals(lastExpression.includes("already-raised"), true);
    assertEquals(lastExpression.includes("raise hand"), true);
  } finally {
    resetCdpSend();
  }
});

Deno.test("screensharer reading: the viewer indicators both platforms render", async () => {
  let expression = "";
  injectCdpSend(async (_sid, _method, params) => {
    expression = params.expression;
    return {};
  });
  const restore = () => resetCdpSend();
  try {
    await getActiveScreensharerInSession("fake-session");
    // zoom's web client banner
    assertEquals(expression.includes("You are viewing"), true);
    // meet's tile header
    assertEquals(expression.includes("is presenting"), true);
    // the page seam owns the sdk events (onShareContentChange /
    // onUserUpdate), and null means nobody: never a guess
    assertEquals(expression.includes("prixieScreensharer"), true);
    // no cdp answer at all = honestly nobody
    assertEquals(await getActiveScreensharerInSession("fake-session"), null);
  } finally {
    resetCdpSend();
  }
});

Deno.test("sharer to signal: isScreenSharing means the CURRENT SPEAKER is presenting", () => {
  assertEquals(sharerToSignal("priya", "priya"), true);
  assertEquals(sharerToSignal(" Priya ", "PRIYA"), true);
  assertEquals(sharerToSignal("priya", "rahul"), false);
  assertEquals(sharerToSignal(null, "priya"), false);
  assertEquals(sharerToSignal("priya", null), false);
  assertEquals(sharerToSignal(null, null), false);
});
