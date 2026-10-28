// outbound mail provider selection: the notify contract (warn + no,
// never a crash) across agentmail, dearagent, and carlyemail senders.
// fetch is stubbed at the global like notify_test does; the shapes are
// pinned against each provider's documented endpoints.

import { assertEquals } from "jsr:@std/assert@1";
import { outboundProvider, sendViaCarly, sendViaDearAgent, sendViaProvider } from "./mail_outbound.ts";

function stubFetch(capture: { url?: string; body?: any; headers?: Record<string, string> }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    capture.url = typeof input === "string" ? input : String(input);
    capture.body = init?.body ? JSON.parse(init.body as string) : undefined;
    capture.headers = (init?.headers || {}) as Record<string, string>;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const EMAIL = { subject: "prixie: captured", body: "the code" };

Deno.test("outbound selection: unset and unknown stay agentmail, explicit wins", () => {
  Deno.env.delete("PRIXIE_OUTBOUND_MAIL");
  assertEquals(outboundProvider(), "agentmail");
  Deno.env.set("PRIXIE_OUTBOUND_MAIL", "dearagent");
  assertEquals(outboundProvider(), "dearagent");
  Deno.env.set("PRIXIE_OUTBOUND_MAIL", "carlyemail");
  assertEquals(outboundProvider(), "carlyemail");
  Deno.env.set("PRIXIE_OUTBOUND_MAIL", "nonsense");
  assertEquals(outboundProvider(), "agentmail");
  Deno.env.delete("PRIXIE_OUTBOUND_MAIL");
});

Deno.test("dearagent sender: the compose endpoint, bearer key, url-encoded inbox", async () => {
  Deno.env.set("DEARAGENT_BASE_URL", "https://dearagent.owner.workers.dev/");
  Deno.env.set("DEARAGENT_API_KEY", "worker-key");
  Deno.env.set("DEARAGENT_FROM_INBOX", "prixie@Owner-Domain.com");
  Deno.env.set("PRIXIE_OWNER_EMAIL", "priya@example.com");
  const cap: any = {};
  const restore = stubFetch(cap);
  try {
    assertEquals(await sendViaDearAgent(EMAIL), true);
    // the inbox id is the LOWERCASED address, @ url-encoded (readme)
    assertEquals(cap.url, "https://dearagent.owner.workers.dev/inboxes/prixie%40owner-domain.com/messages");
    assertEquals(cap.headers["Authorization"], "Bearer worker-key");
    assertEquals(cap.body.subject, "prixie: captured");
    assertEquals(cap.body.text, "the code");
    assertEquals(cap.body.to, "priya@example.com");
  } finally {
    restore();
    Deno.env.delete("DEARAGENT_BASE_URL");
    Deno.env.delete("DEARAGENT_API_KEY");
    Deno.env.delete("DEARAGENT_FROM_INBOX");
    Deno.env.delete("PRIXIE_OWNER_EMAIL");
  }
});

Deno.test("carlyemail sender: the send endpoint, to is an ARRAY (docs' shape)", async () => {
  Deno.env.set("CARLYEMAIL_API_KEY", "carly-key");
  Deno.env.set("CARLYEMAIL_INBOX_ID", "prixie@yourdomain.com");
  Deno.env.set("PRIXIE_OWNER_EMAIL", "priya@example.com");
  const cap: any = {};
  const restore = stubFetch(cap);
  try {
    assertEquals(await sendViaCarly(EMAIL), true);
    assertEquals(
      cap.url,
      "https://api.carlyemail.com/v0/inboxes/prixie%40yourdomain.com/messages/send",
    );
    assertEquals(cap.headers["Authorization"], "Bearer carly-key");
    // "to" is an array in carly's contract, unlike agentmail's single
    assertEquals(cap.body.to, ["priya@example.com"]);
    assertEquals(cap.body.text, "the code");
  } finally {
    restore();
    Deno.env.delete("CARLYEMAIL_API_KEY");
    Deno.env.delete("CARLYEMAIL_INBOX_ID");
    Deno.env.delete("PRIXIE_OWNER_EMAIL");
  }
});

Deno.test("sendViaProvider: agentmail answers null (the caller's own sender), others route", async () => {
  assertEquals(await sendViaProvider("agentmail", EMAIL), null);

  // no creds = warn + no, never a crash (the notify contract)
  Deno.env.delete("DEARAGENT_BASE_URL");
  Deno.env.delete("DEARAGENT_API_KEY");
  assertEquals(await sendViaProvider("dearagent", EMAIL), false);

  Deno.env.delete("CARLYEMAIL_API_KEY");
  Deno.env.delete("CARLYEMAIL_INBOX_ID");
  assertEquals(await sendViaProvider("carlyemail", EMAIL), false);
});
