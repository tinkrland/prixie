// shared doc access (the owner, oct 21 2026): the host drops a google doc
// link in the chat, she clicks it, and she does not have access.
// what should happen:
//
//   1. she opens the link WITHOUT leaving the call. the meeting session
//      is never navigated away from the join page: the link opens in a
//      side session, the same proven pattern as form entry. (when
//      browserbase grows a tabs api this can swap transports, but the
//      call tab staying untouched is the actual requirement, and it
//      already holds.)
//   2. if the doc is public / she already has access: done, no nudge.
//   3. if denied: she tries google's own request-access flow. honest
//      caveat: a throwaway session is not signed into google, so the
//      request only goes through if the page accepts her email
//      (PRIXIE_GOOGLE_EMAIL, never the owner's personal one). whether the
//      request was confirmed is READ from the page, not assumed.
//   4. she goes back to the meeting tab and asks IN THE CHAT, addressing
//      the host by name when she read the room: requested -> "just sent
//      a request from <email>, can you approve it"; not requested ->
//      "could you share it with <email>".
//
// the link safety gate runs before the side session exists, as always.
// google FORMS in chat are attendance's territory, not this flow's.
// one attempt per link per meeting.

export interface DocAccessReceipt {
  url: string;
  denied: boolean;        // the page showed the no-access state
  requested: boolean;     // google confirmed the request, read from page
  nudged_in_chat: boolean;
  detail: string;
}

// doc-ish google links. /forms excluded: chat attendance owns them.
const DOC_PATTERNS = [
  /^docs\.google\.com\/(document|presentation|spreadsheets|drawings)\//,
  /^drive\.google\.com\/(file|drive)\//,
  /^jamboard\.google\.com\/d\//,
];

export function extractSharedDocLink(text: string): string | null {
  const matches = text.match(/(https?:\/\/[^\s"'<>)]+)/gi) || [];
  for (const raw of matches) {
    try {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./, "");
      if (DOC_PATTERNS.some((p) => p.test(host + url.pathname))) return raw;
    } catch {
      // not a url: not hers
    }
  }
  return null;
}

// the page states google shows when access is missing, and when the
// request went through. read from the page, never assumed.
const DENIED_TEXT = /(request access|you need access|need permission|you don't have access|ask owner for access)/i;
const REQUESTED_TEXT = /(you have requested access|request sent|access request sent|pending)/i;

export function pageState(bodyText: string): "denied" | "requested" | "open" {
  if (REQUESTED_TEXT.test(bodyText)) return "requested";
  if (DENIED_TEXT.test(bodyText)) return "denied";
  return "open";
}

export function buildAccessNudge(
  hostName: string | null | undefined,
  email: string,
  requested: boolean,
): string {
  const greeting = hostName ? `hey ${hostName}` : "hey";
  if (requested) {
    return greeting +
      `, i don't have access to the doc you shared. i just sent a request from ${email}, can you approve it when you get a sec?`;
  }
  return greeting +
    `, i don't have access to the doc you shared, could you share it with ${email}?`;
}

// one attempt per link per meeting, the house rule against loops.
const attempted = new Map<string, Set<string>>();

export function alreadyAttempted(meetingId: string, url: string): boolean {
  return attempted.get(meetingId)?.has(url) ?? false;
}

export function markAttempted(meetingId: string, url: string): void {
  if (!attempted.has(meetingId)) attempted.set(meetingId, new Set());
  attempted.get(meetingId)!.add(url);
}
