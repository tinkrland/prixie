// notify tests: the redemption-window contract. the email must carry the
// meeting, the watch request, the exact snippet, and the redeem-now
// warning. creds missing = honest no-op, never a throw.

import { assertEquals } from "jsr:@std/assert@1";
import { buildCaptureEmail, notifyOwner, notifyCaptureMatch } from "./notify.ts";

Deno.test("capture email carries the essentials and the redeem-now warning", () => {
  const email = buildCaptureEmail({
    meetingTitle: "cs 370 office hours",
    captureTitle: "the access code",
    snippet: "prof: the access code is PRIXIE BUILD 2026 X9",
    link: "https://example.com/form",
    capturedAt: new Date("2026-10-21T17:40:00Z"),
  });

  assertEquals(email.subject, 'prixie: captured "the access code" in cs 370 office hours');
  assertEquals(email.body.includes("PRIXIE BUILD 2026 X9"), true);
  assertEquals(email.body.includes("https://example.com/form"), true);
  assertEquals(email.body.includes("redeem it now"), true);
  assertEquals(email.body.includes("2026-10-21 17:40 UTC"), true);
});

Deno.test("a heard expiry escalates the subject and the body", () => {
  const email = buildCaptureEmail({
    meetingTitle: "cs 370",
    captureTitle: "the access code",
    snippet: "prof: PRIXIE10",
    capturedAt: new Date("2026-10-21T17:40:00Z"),
    expiry: {
      kind: "minutes",
      minutes: 10,
      expiresAt: "2026-10-21T17:50:00.000Z",
      quote: "it expires in 10 minutes",
      urgent: true,
    },
  });
  assertEquals(
    email.subject,
    'prixie: captured "the access code" in cs 370 (expires in ~10 min)',
  );
  assertEquals(email.body.includes('"it expires in 10 minutes"'), true);
  assertEquals(email.body.includes("about 10 minutes"), true);
  assertEquals(email.body.includes("does not wait for the recap"), true);
  // the generic guess line is replaced, not added on top
  assertEquals(email.body.includes("if this code expires when the meeting ends"), false);
});

Deno.test("a window with no computable length carries the kind, not a guess", () => {
  const email = buildCaptureEmail({
    meetingTitle: "m",
    captureTitle: "c",
    snippet: "s",
    capturedAt: new Date("2026-10-21T17:40:00Z"),
    expiry: { kind: "meeting_end", quote: "only works during the meeting", urgent: false },
  });
  assertEquals(email.subject, 'prixie: captured "c" in m (time limited)');
  assertEquals(email.body.includes("when the meeting ends"), true);
  assertEquals(email.body.includes("redeem it soon"), true);
});

Deno.test("no creds: honest no-op, no throw", async () => {
  // no AGENTMAIL_* / PRIXIE_OWNER_EMAIL in this test env
  const sent = await notifyOwner({ subject: "x", body: "y" });
  assertEquals(sent, false);
  const viaMatch = await notifyCaptureMatch({
    meetingTitle: "m",
    captureTitle: "c",
    snippet: "s",
    capturedAt: new Date(),
  });
  assertEquals(viaMatch, false);
});

Deno.test("with creds: one post to agentmail outbound, bearer auth", async () => {
  const originalFetch = globalThis.fetch;
  Deno.env.set("AGENTMAIL_API_KEY", "test_key");
  Deno.env.set("AGENTMAIL_INBOX_ID", "inbox_123");
  Deno.env.set("PRIXIE_OWNER_EMAIL", "priya@example.com");

  let captured: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    captured = { url: String(input), init: init! };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const sent = await notifyOwner({ subject: "prixie: code", body: "now" });
    assertEquals(sent, true);
    assertEquals(captured!.url, "https://api.agentmail.to/v0/inboxes/inbox_123/messages/send");
    assertEquals(
      (captured!.init.headers as Record<string, string>)["Authorization"],
      "Bearer test_key",
    );
    const body = JSON.parse(String(captured!.init.body));
    assertEquals(body.to, "priya@example.com");
    assertEquals(body.subject, "prixie: code");
    // text, not body: "body" sends a blank email (verified live oct 25 2026)
    assertEquals(body.text, "now");
    assertEquals(body.body, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("AGENTMAIL_API_KEY");
    Deno.env.delete("AGENTMAIL_INBOX_ID");
    Deno.env.delete("PRIXIE_OWNER_EMAIL");
  }
});
