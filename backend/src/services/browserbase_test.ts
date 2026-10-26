// browserbase eval injection tests. every cdp Runtime.evaluate expression
// is a JS program built from untrusted strings (selectors from page shape,
// text from meeting chats). these tests capture the expressions the
// service builds and RUN them against a fake document with hostile
// payloads: the payload must land as data and never execute as code.

import { assertEquals } from "jsr:@std/assert@1";
import { findAndClick, findAndType, sendChatInSession, setScreenshareInSession, injectCdpSend, resetCdpSend } from "./browserbase.ts";

// capture the last Runtime.evaluate expression sent over cdp
let lastExpression = "";
function stubCdpFetch(evaluate = false): () => void {
  // the transport seam (injectCdpSend): the expressions are under
  // test here, the websocket itself is live-verified against the real
  // api, so the tests ride the seam, not fetch
  injectCdpSend(async (_sid: string, method: string, params: any) => {
    if (method === "Runtime.evaluate") {
      lastExpression = params.expression;
    }
    // genuine mode runs the captured expression for real (against the
    // installed fake dom / page seams), awaiting promises like cdp's
    // awaitPromise. default mode keeps "clicked" so polling helpers
    // stay fast for the older tests.
    if (evaluate) {
      try {
        let value = evalCaptured();
        if (value instanceof Promise && params?.awaitPromise) {
          value = await value;
        }
        return { result: { value: value ?? null } };
      } catch {
        return { result: {} };
      }
    }
    return { result: { value: "clicked" } };
  });
  return () => {
    resetCdpSend();
  };
}

// a minimal document that records what happened to the element
function installFakeDocument(inputValue = "", exists = true) {
  const clicked = { value: false };
  const el = {
    value: inputValue,
    clicked,
    focus() {},
    click() {
      clicked.value = true;
    },
    dispatchEvent(_e: unknown) {},
    offsetParent: {},
    textContent: "",
    getAttribute: () => "",
  };
  const fakeDocument = {
    querySelector: (_sel: string) => (exists ? el : null),
    querySelectorAll: (_sel: string) => (exists ? [el] : []),
  };
  const original = (globalThis as Record<string, unknown>).document;
  (globalThis as Record<string, unknown>).document = fakeDocument;
  return {
    el,
    clicked,
    restore() {
      (globalThis as Record<string, unknown>).document = original;
    },
  };
}

function evalCaptured(): unknown {
  // indirect eval returns the completion value, same contract as
  // Runtime.evaluate's returnByValue
  const run = new Function(`"use strict"; return eval(${JSON.stringify(lastExpression)})`);
  return run();
}

Deno.test("findAndType: hostile text lands as data, never as code", async () => {
  const restoreFetch = stubCdpFetch();
  const hostile = `'; globalThis.__injected = true; el.value = 'pwned`;
  const dom = installFakeDocument();
  try {
    await findAndType("s1", "input[name='x']", hostile, 10);
    assertEquals((globalThis as Record<string, unknown>).__injected, undefined);
    assertEquals(evalCaptured(), "typed");
    assertEquals(dom.el.value, hostile); // round trip, exactly as typed
  } finally {
    dom.restore();
    restoreFetch();
    delete (globalThis as Record<string, unknown>).__injected;
  }
});

Deno.test("findAndType: backslash and newline survive the literal", async () => {
  const restoreFetch = stubCdpFetch();
  const hostile = "line one\nline two\\ and a trailing backslash \\\\";
  const dom = installFakeDocument();
  try {
    await findAndType("s1", 'input[value*="it\'s"]', hostile, 10);
    assertEquals(evalCaptured(), "typed");
    assertEquals(dom.el.value, hostile);
  } finally {
    dom.restore();
    restoreFetch();
  }
});

Deno.test("findAndClick: hostile selector cannot inject, real clicks report true", async () => {
  const restoreFetch = stubCdpFetch();
  const hostileSelector = "button') || (() => { globalThis.__clickInjected = true; return 'x'; })() || ('";
  const dom = installFakeDocument();
  try {
    await findAndClick("s1", hostileSelector, 10);
    assertEquals((globalThis as Record<string, unknown>).__clickInjected, undefined);
    assertEquals(evalCaptured(), "clicked");
    assertEquals(dom.clicked.value, true); // the click really happened
  } finally {
    dom.restore();
    restoreFetch();
    delete (globalThis as Record<string, unknown>).__clickInjected;
  }
});

Deno.test("findAndClick: missing element reports not found, no click", async () => {
  const restoreFetch = stubCdpFetch();
  const dom = installFakeDocument("", false);
  try {
    await findAndClick("s1", "button", 10);
    assertEquals(evalCaptured(), "not found");
    assertEquals(dom.clicked.value, false);
  } finally {
    dom.restore();
    restoreFetch();
  }
});

Deno.test("sendChatInSession: message text never escapes the literal", async () => {
  const restoreFetch = stubCdpFetch(true);
  const hostile = `present! '; globalThis.__chatInjected = true; //`;
  const dom = installFakeDocument();
  dom.el.textContent = "chat";
  // deno has no KeyboardEvent; the page-side expression needs one
  const g = globalThis as Record<string, unknown>;
  const originalKE = g.KeyboardEvent;
  g.KeyboardEvent = class extends Event {
    key: string;
    code: string;
    keyCode: number;
    which: number;
    constructor(type: string, init?: { key?: string; code?: string; keyCode?: number; which?: number }) {
      super(type);
      this.key = init?.key || "";
      this.code = init?.code || "";
      this.keyCode = init?.keyCode || 0;
      this.which = init?.which || 0;
    }
  };
  try {
    const r = await sendChatInSession("s1", hostile);
    assertEquals((globalThis as Record<string, unknown>).__chatInjected, undefined);
    assertEquals(r.sent, true);
    assertEquals(r.to, "everyone");
    assertEquals(evalCaptured(), "sent");
    assertEquals(dom.el.value, hostile);
  } finally {
    dom.restore();
    restoreFetch();
    if (originalKE === undefined) delete g.KeyboardEvent;
    else g.KeyboardEvent = originalKE;
    delete (globalThis as Record<string, unknown>).__chatInjected;
  }
});

// honest entry tests (the owner, oct 22 2026): a click on "ask to join" is a
// knock, not success. classifyEntry is the probe's honest mapping,
// entryVerdict is the join result, and awaitEntry re-knocks while the
// waiting room ignores her.
import { awaitEntry, classifyEntry, entryVerdict } from "./browserbase.ts";

Deno.test("classifyEntry: only entered and waiting count, everything else is unknown", () => {
  assertEquals(classifyEntry("entered"), "entered");
  assertEquals(classifyEntry("waiting"), "waiting");
  assertEquals(classifyEntry("unknown"), "unknown");
  assertEquals(classifyEntry(undefined), "unknown");
});

Deno.test("entryVerdict: entered is joined, waiting is never success, unknown fails honestly", () => {
  const joined = entryVerdict("s1", { state: "entered", knocks: 1 });
  assertEquals(joined.status, "joined");
  assertEquals(joined.knocks, 1);

  const waiting = entryVerdict("s1", { state: "waiting", knocks: 4 });
  assertEquals(waiting.status, "waiting_room");
  assertEquals(waiting.knocks, 4);
  assertEquals(waiting.error, "asked 4x, not admitted yet");

  const unknown = entryVerdict("s1", { state: "unknown", knocks: 2 });
  assertEquals(unknown.status, "failed");
  assertEquals(unknown.error, "clicked join but never entered the room (entry state unknown)");
});

Deno.test("awaitEntry: a missed popup gets knocked again, entry is seen", async () => {
  // the probe says waiting first; the re-knock click lands; then she
  // is let in. the loop must report the extra knock.
  const fakeDoc = installFakeDocument();
  // probe says waiting; she re-knocks; the next probe sees her let in
  const probes = ["waiting", "waiting", "entered"];
  injectCdpSend(async (_sid: string, method: string, params: any) => {
    const expr = String(method === "Runtime.evaluate" ? params?.expression || "" : "");
    const value = expr.includes("el.click()") // the knock click, not the probe
      ? "clicked"
      : probes.shift() ?? "entered";
    return { result: { value } };
  });

  try {
    const outcome = await awaitEntry("s1", { pollMs: 10, reknockEveryMs: 10, maxWaitMs: 5000 });
    assertEquals(outcome.state, "entered");
    assertEquals(outcome.knocks, 2); // the ask, then the re-knock
  } finally {
    resetCdpSend();
    fakeDoc.restore();
  }
});

Deno.test("awaitEntry: ignored forever is waiting, with every knock counted", async () => {
  const fakeDoc = installFakeDocument();
  let knocks = 0;
  injectCdpSend(async (_sid: string, method: string, params: any) => {
    const expr = String(method === "Runtime.evaluate" ? params?.expression || "" : "");
    const value = expr.includes("el.click()") ? (knocks++, "clicked") : "waiting";
    return { result: { value } };
  });

  try {
    const outcome = await awaitEntry("s1", { pollMs: 5, reknockEveryMs: 10, maxWaitMs: 80 });
    assertEquals(outcome.state, "waiting");
    assertEquals(outcome.knocks >= 5, true); // the ask plus every re-knock, not one and done
  } finally {
    resetCdpSend();
    fakeDoc.restore();
  }
});

// a fake page seam installed as window.prixieSendChat /
// window.prixieShareScreen, recording what it was called with
function installFakePageSeams(chatVerdict?: string, shareVerdict?: string) {
  const calls: { chat?: [string, string | null]; share?: string } = {};
  const g = globalThis as Record<string, unknown>;
  const originalWindow = g.window;
  g.window = {
    prixieSendChat: (message: string, toName?: string | null) => {
      calls.chat = [message, toName ?? null];
      return Promise.resolve(chatVerdict);
    },
    prixieShareScreen: (action: string) => {
      calls.share = action;
      return Promise.resolve(shareVerdict);
    },
  };
  return {
    calls,
    restore() {
      g.window = originalWindow;
    },
  };
}

Deno.test("sendChatInSession: the page seam carries the dm to the named recipient", async () => {
  const restoreFetch = stubCdpFetch(true);
  const page = installFakePageSeams("sent-dm");
  try {
    const r = await sendChatInSession("s1", "hey can you see my hand?", "Priya Organizer");
    assertEquals(r, { sent: true, to: "dm" });
    // the hostile-escape guarantee holds on the seam path too: the
    // payload is data in the expression, so what the fake receives is
    // the exact string
    assertEquals(page.calls.chat?.[0], "hey can you see my hand?");
    assertEquals(page.calls.chat?.[1], "Priya Organizer");
    // and the expression itself never evaluated a document (no dom
    // typing happened: the seam is the whole path)
  } finally {
    page.restore();
    restoreFetch();
  }
});

Deno.test("sendChatInSession: a refused dm is not a broadcast", async () => {
  const restoreFetch = stubCdpFetch(true);
  // the seam exists but the host blocks private chat
  const page = installFakePageSeams("send-failed");
  const dom = installFakeDocument();
  dom.el.textContent = "chat";
  try {
    const r = await sendChatInSession("s1", "psst", "Priya Organizer");
    assertEquals(r, { sent: false, to: "nobody" });
    // nothing was typed anywhere
    assertEquals(dom.el.value, "");
  } finally {
    dom.restore();
    page.restore();
    restoreFetch();
  }
});

Deno.test("sendChatInSession: without a seam and without a recipient menu, no dm and no broadcast", async () => {
  const restoreFetch = stubCdpFetch(true);
  const dom = installFakeDocument(); // no matching dropdown options
  dom.el.textContent = "chat";
  try {
    const r = await sendChatInSession("s1", "private note", "Priya Organizer");
    assertEquals(r, { sent: false, to: "nobody" });
    assertEquals(dom.el.value, "");
  } finally {
    dom.restore();
    restoreFetch();
  }
});

Deno.test("setScreenshareInSession: the page seam answers start and stop", async () => {
  const restoreFetch = stubCdpFetch(true);
  const page = installFakePageSeams(undefined, "started");
  try {
    assertEquals(await setScreenshareInSession("s1", "start"), true);
    assertEquals(page.calls.share, "start");
    page.calls.share = undefined;
    (globalThis as Record<string, unknown>).window = {
      prixieShareScreen: (action: string) => {
        page.calls.share = action;
        return Promise.resolve("stopped");
      },
    };
    assertEquals(await setScreenshareInSession("s1", "stop"), true);
    assertEquals(page.calls.share, "stop");
  } finally {
    page.restore();
    restoreFetch();
  }
});