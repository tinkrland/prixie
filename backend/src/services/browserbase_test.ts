// browserbase eval injection tests. every cdp Runtime.evaluate expression
// is a JS program built from untrusted strings (selectors from page shape,
// text from meeting chats). these tests capture the expressions the
// service builds and RUN them against a fake document with hostile
// payloads: the payload must land as data and never execute as code.

import { assertEquals } from "jsr:@std/assert@1";
import { findAndClick, findAndType, sendChatInSession } from "./browserbase.ts";

// capture the last Runtime.evaluate expression sent over cdp
let lastExpression = "";
function stubCdpFetch(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.method === "Runtime.evaluate") {
      lastExpression = body.params.expression;
    }
    // "clicked" satisfies the polling helpers so the suite stays fast
    return new Response(JSON.stringify({ result: { value: "clicked" } }), {
      status: 200,
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
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
  const restoreFetch = stubCdpFetch();
  const hostile = `present! '; globalThis.__chatInjected = true; //`;
  const dom = installFakeDocument();
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
    await sendChatInSession("s1", hostile);
    assertEquals((globalThis as Record<string, unknown>).__chatInjected, undefined);
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
  const originalFetch = globalThis.fetch;
  // probe says waiting; she re-knocks; the next probe sees her let in
  const probes = ["waiting", "waiting", "entered"];
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const expr = String(body.params?.expression || "");
    const value = expr.includes("el.click()") // the knock click, not the probe
      ? "clicked"
      : probes.shift() ?? "entered";
    return new Response(JSON.stringify({ result: { value } }), { status: 200 });
  }) as typeof fetch;

  try {
    const outcome = await awaitEntry("s1", { pollMs: 10, reknockEveryMs: 10, maxWaitMs: 5000 });
    assertEquals(outcome.state, "entered");
    assertEquals(outcome.knocks, 2); // the ask, then the re-knock
  } finally {
    globalThis.fetch = originalFetch;
    fakeDoc.restore();
  }
});

Deno.test("awaitEntry: ignored forever is waiting, with every knock counted", async () => {
  const fakeDoc = installFakeDocument();
  const originalFetch = globalThis.fetch;
  let knocks = 0;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const expr = String(body.params?.expression || "");
    const value = expr.includes("el.click()") ? (knocks++, "clicked") : "waiting";
    return new Response(JSON.stringify({ result: { value } }), { status: 200 });
  }) as typeof fetch;

  try {
    const outcome = await awaitEntry("s1", { pollMs: 5, reknockEveryMs: 10, maxWaitMs: 80 });
    assertEquals(outcome.state, "waiting");
    assertEquals(outcome.knocks >= 5, true); // the ask plus every re-knock, not one and done
  } finally {
    globalThis.fetch = originalFetch;
    fakeDoc.restore();
  }
});
