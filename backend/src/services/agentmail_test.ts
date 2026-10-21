// agentmail tests: the pure half of the inbox. a forwarded email is
// text at heart; the meeting link comes from the same extractor every
// other source uses. agentMailInbound itself (which writes a meeting) is
// covered by the route's contract, not mocked here.

import { assertEquals } from "jsr:@std/assert";
import { findMeetingLink, stripHtml } from "./agentmail.ts";

Deno.test("a forwarded zoom invite yields its join link", () => {
  const link = findMeetingLink({
    message_id: "m_1",
    from: "prof@example.edu",
    subject: "Fwd: cs 225 lecture today",
    text: `hi prixie,\n\nplease attend today's lecture.\n\nhttps://zoom.us/j/987654321?pwd=abc123\n\nsee you there.`,
  });
  assertEquals(link, "https://zoom.us/j/987654321?pwd=abc123");
});

Deno.test("the link is found in the html body when the text part is empty", () => {
  const link = findMeetingLink({
    message_id: "m_2",
    from: "boss@example.com",
    subject: "client sync",
    html: `<html><body>join here: <a href="https://meet.google.com/abc-defg-hij">meet link</a></body></html>`,
  });
  assertEquals(link, "https://meet.google.com/abc-defg-hij");
});

Deno.test("an email with no meeting link returns null, not a guess", () => {
  assertEquals(
    findMeetingLink({
      message_id: "m_3",
      from: "mom@example.com",
      subject: "dinner sunday?",
      text: "just checking in. call me when you can!",
    }),
    null,
  );
});

Deno.test("stripHtml removes markup and decodes the common entities", () => {
  const text = stripHtml(
    `<p>hello &amp; welcome</p><script>alert(1)</script><style>a{}</style><b>&quot;quoted&quot;</b>`,
  );
  assertEquals(text.includes("hello & welcome"), true);
  assertEquals(text.includes("alert"), false, "script content is dropped");
  assertEquals(text.includes("&quot;"), false, "entities decode");
});

Deno.test("a teams link from a forwarded mail parses too", () => {
  const link = findMeetingLink({
    message_id: "m_4",
    from: "hr@example.com",
    subject: "Fwd: onboarding session",
    text: "https://teams.microsoft.com/l/meetup-join/19:meeting_abc@thread.v2/0?context=tid",
  });
  assertEquals(link?.includes("teams.microsoft.com"), true);
});
