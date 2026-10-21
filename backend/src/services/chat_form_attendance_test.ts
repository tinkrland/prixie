// chat attendance form tests: she fills forms the chat calls
// attendance, ignores form links that are not hers to touch.

import { assertEquals } from "jsr:@std/assert@1";
import {
  extractFormLink,
  hasAttendanceContext,
  decideChatForm,
} from "./chat_form_attendance.ts";

Deno.test("google forms and the common form hosts are recognized", () => {
  assertEquals(
    extractFormLink("fill this out: https://docs.google.com/forms/d/e/1FAIpQLSfX/viewform"),
    "https://docs.google.com/forms/d/e/1FAIpQLSfX/viewform",
  );
  assertEquals(
    extractFormLink("sign in at https://forms.gle/abc123"),
    "https://forms.gle/abc123",
  );
  assertEquals(
    extractFormLink("form: https://form.typeform.com/to/xyz"),
    "https://form.typeform.com/to/xyz",
  );
  assertEquals(
    extractFormLink("https://forms.office.com/Pages/ResponsePage.aspx?id=q"),
    "https://forms.office.com/Pages/ResponsePage.aspx?id=q",
  );
});

Deno.test("non-form links are not forms", () => {
  assertEquals(extractFormLink("check https://zoom.us/j/12345"), null);
  assertEquals(extractFormLink("slides at https://docs.google.com/presentation/d/1/edit"), null);
  assertEquals(extractFormLink("no link here at all"), null);
});

Deno.test("attendance context is the host's language", () => {
  assertEquals(hasAttendanceContext("everyone fill this out for attendance please"), true);
  assertEquals(hasAttendanceContext("sign in here so you get credit"), true);
  assertEquals(hasAttendanceContext("check in in the chat"), true);
  assertEquals(hasAttendanceContext("mark yourselves present"), true);
  assertEquals(hasAttendanceContext("here is the feedback survey"), false);
});

Deno.test("the decision gates, in order", () => {
  const form = "https://docs.google.com/forms/d/e/1/viewform";
  // already attended: never
  assertEquals(
    decideChatForm({ attendance_messages_sent: true }, `attendance: ${form}`, true).should_fill,
    false,
  );
  // form link with attendance context: fill
  assertEquals(
    decideChatForm({}, `fill this for attendance: ${form}`, true).should_fill,
    true,
  );
  // form link with NO context, meeting does not expect a form: redeem
  // territory, not hers
  const d = decideChatForm({}, `here is a form: ${form}`, true);
  assertEquals(d.should_fill, false);
  assertEquals(d.reason, "form link without attendance context");
  // a form-attendance meeting counts any form link, context or not
  assertEquals(
    decideChatForm({ attendance_method: "form" }, `link: ${form}`, true).should_fill,
    true,
  );
  // no identity configured: no, honestly
  assertEquals(
    decideChatForm({}, `attendance: ${form}`, false).should_fill,
    false,
  );
  // not a form link: no
  assertEquals(decideChatForm({}, "attendance at https://zoom.us/j/1", true).should_fill, false);
});
