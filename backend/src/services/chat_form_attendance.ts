// chat attendance forms (the owner, oct 21 2026): sometimes the attendance
// IS a google form posted in the meeting chat. the host drops a link,
// everyone fills it, and prixie should be one of everyone.
//
// the rule: she fills a chat form only when the chat says it is
// attendance (or the meeting was configured for form attendance). a
// bare form link with no attendance context is NOT hers to touch:
// that is the redeem path's territory, and it is capture-gated.
//
// the fill itself is the same enterForm as the pre-set attendance form
// and the redemption path: link safety gate first, her form identity
// (PRIXIE_FORM_EMAIL / PRIXIE_FORM_NAME, never the owner's), submit, no
// credit card fields ever. one attempt per link per meeting: a repost
// does not refire a failed entry, honestly.

export interface ChatFormDecision {
  should_fill: boolean;
  url: string | null;
  reason: string;
}

// the form hosts she knows how to enter. a generic google doc link is
// not a form; a /forms/ link is.
const FORM_HOST_PATTERNS = [
  /^docs\.google\.com\/forms\//,
  /^forms\.gle\//,
  /^form\.typeform\.com\//,
  /^forms\.office\.com\//,
  /^form\.jotform\.com\//,
  /^www\.jotform\.com\//,
  /^airtable\.com\/shr\w+\b/,
  /^tally\.so\//,
  /^www\.surveymonkey\.com\/r\//,
  /^forms\.gladeform\//,
];

// what the chat says when the form is attendance. present-tense host
// language: "fill this out for attendance", "sign in here", "check in
// in the chat", "mark yourselves present".
const ATTENDANCE_CONTEXT =
  /(attend|sign[- ]?in|check[- ]?in|roll call|be present|mark (yourself|yourselves|your name|it)|confirm(ing)? (attendance|participation))/i;

export function extractFormLink(text: string): string | null {
  const matches = text.match(/(https?:\/\/[^\s"'<>)]+)/gi) || [];
  for (const raw of matches) {
    try {
      const url = new URL(raw);
      const path = url.hostname.replace(/^www\./, "") + url.pathname +
        (url.hostname.includes("docs.google.com") || url.hostname.includes("forms.office.com")
          ? url.search
          : "");
      // google forms long urls: the form is the /forms/d/e/.../viewform path
      const host = url.hostname.replace(/^www\./, "");
      if (FORM_HOST_PATTERNS.some((p) => p.test(host + url.pathname))) return raw;
      if (/^docs\.google\.com$/.test(host) && /\/forms\/d\/e\/.+\/viewform/.test(url.pathname)) {
        return raw;
      }
    } catch {
      // not a parseable url: not hers
    }
  }
  return null;
}

export function hasAttendanceContext(text: string): boolean {
  return ATTENDANCE_CONTEXT.test(text);
}

// pure: the decision for one chat message in one meeting.
// - already attended -> no
// - no form link -> no
// - form link but no attendance context and the meeting is not a
//   form-attendance meeting -> no (that is redeem territory)
// - no form identity configured -> no, honestly
export function decideChatForm(
  meeting: { attendance_messages_sent?: boolean; attendance_method?: string | null },
  text: string,
  formIdentityConfigured: boolean,
): ChatFormDecision {
  if (meeting.attendance_messages_sent) {
    return { should_fill: false, url: null, reason: "attendance already marked" };
  }
  const url = extractFormLink(text);
  if (!url) {
    return { should_fill: false, url: null, reason: "no form link" };
  }
  const meetingExpectsForm = meeting.attendance_method === "form";
  if (!meetingExpectsForm && !hasAttendanceContext(text)) {
    return { should_fill: false, url, reason: "form link without attendance context" };
  }
  if (!formIdentityConfigured) {
    return { should_fill: false, url, reason: "no PRIXIE_FORM_EMAIL configured" };
  }
  return { should_fill: true, url, reason: meetingExpectsForm ? "meeting expects a form" : "attendance context in chat" };
}

// one attempt per link per meeting, so a reposted link never loops.
const attemptedForms = new Map<string, Set<string>>();

export function alreadyAttempted(meetingId: string, url: string): boolean {
  return attemptedForms.get(meetingId)?.has(url) ?? false;
}

export function markAttempted(meetingId: string, url: string): void {
  if (!attemptedForms.has(meetingId)) attemptedForms.set(meetingId, new Set());
  attemptedForms.get(meetingId)!.add(url);
}
