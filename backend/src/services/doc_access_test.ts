// shared doc access tests: what she clicks, what she reads off the
// page, and what she says back in the chat.

import { assertEquals } from "jsr:@std/assert@1";
import {
  extractSharedDocLink,
  pageState,
  buildAccessNudge,
} from "./doc_access.ts";

Deno.test("doc links are recognized, forms are not hers", () => {
  assertEquals(
    extractSharedDocLink("notes: https://docs.google.com/document/d/1abc/edit"),
    "https://docs.google.com/document/d/1abc/edit",
  );
  assertEquals(
    extractSharedDocLink("deck at https://docs.google.com/presentation/d/1x/edit"),
    "https://docs.google.com/presentation/d/1x/edit",
  );
  assertEquals(
    extractSharedDocLink("board: https://jamboard.google.com/d/abc"),
    "https://jamboard.google.com/d/abc",
  );
  assertEquals(
    extractSharedDocLink("file https://drive.google.com/file/d/1z/view"),
    "https://drive.google.com/file/d/1z/view",
  );
  // attendance forms stay in their own flow
  assertEquals(
    extractSharedDocLink("attendance: https://docs.google.com/forms/d/e/1/viewform"),
    null,
  );
  assertEquals(extractSharedDocLink("join at https://zoom.us/j/123"), null);
});

Deno.test("page states are read, not assumed", () => {
  assertEquals(pageState("You need access Request access"), "denied");
  assertEquals(pageState("Ask owner for access to view"), "denied");
  assertEquals(pageState("You have requested access from this account"), "requested");
  assertEquals(pageState("Request sent. The owner will get an email"), "requested");
  assertEquals(pageState("Untitled document File Edit View Insert"), "open");
});

Deno.test("the nudge addresses the host, and says what actually happened", () => {
  assertEquals(
    buildAccessNudge("priya", "prixie@example.com", true),
    "hey priya, i don't have access to the doc you shared. i just sent a request from prixie@example.com, can you approve it when you get a sec?",
  );
  assertEquals(
    buildAccessNudge(null, "prixie@example.com", false),
    "hey, i don't have access to the doc you shared, could you share it with prixie@example.com?",
  );
});
