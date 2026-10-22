// multi calendar sync service
// one adapter per source, all producing the same MeetingCandidate:
//   pull sources:  google calendar, microsoft calendar (outlook/graph),
//                  notion calendar, apple calendar (caldav), cal.com (booking api)
//   pushed source: zcal (no public api: its bookings land in the host's own
//                  calendar and send confirmation mail; the webhook/inbox
//                  route parses them)
// the shape an adapter must produce is MeetingCandidate; adding a source means
// adding one function and one config key in syncAllCalendars, nothing else.

import { createClient } from "npm:@supabase/supabase-js@2";
import { shiftWallClock } from "./timezone.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export type CalendarSource =
  | "google"      // google calendar api
  | "outlook"     // microsoft calendar via graph
  | "notion"      // notion calendar database
  | "apple"       // apple calendar via caldav
  | "calcom"      // cal.com v2 bookings api
  | "zcal"        // zcal bookings (webhook/inbox, no public api)
  | "calendly"
  | "luma";

export interface MeetingCandidate {
  title: string;
  start_time: string;
  end_time?: string;
  join_url?: string;
  platform?: string;
  source: CalendarSource;
  source_event_id: string;
  timezone?: string;
  raw_location?: string;
}

// --- google calendar (existing, enhanced) ---

export async function syncGoogleCalendar(calendarId: string): Promise<MeetingCandidate[]> {
  const { data: syncState } = await supabase
    .from("sync_states")
    .select("*")
    .eq("calendar_id", calendarId)
    .single();

  const now = new Date();
  const timeMin = syncState?.last_synced || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const accessToken = Deno.env.get("GOOGLE_CALENDAR_ACCESS_TOKEN");
  if (!accessToken) return [];

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );

  if (!res.ok) return [];
  const data = await res.json();

  const candidates: MeetingCandidate[] = [];
  for (const event of data.items || []) {
    const joinUrl = extractMeetingUrl(event.location || "", event.hangoutLink || "");
    const platform = detectPlatform(joinUrl || event.location || "");

    candidates.push({
      title: event.summary || "untitled event",
      start_time: event.start?.dateTime || event.start?.date,
      end_time: event.end?.dateTime || event.end?.date,
      join_url: joinUrl,
      platform,
      source: "google",
      source_event_id: event.id,
      timezone: event.start?.timeZone,
      raw_location: event.location,
    });
  }

  // update sync state
  await supabase.from("sync_states").upsert({
    calendar_id: calendarId,
    sync_token: data.nextSyncToken,
    last_synced: now.toISOString(),
  });

  return candidates;
}

// --- microsoft outlook calendar ---

export async function syncOutlookCalendar(accessToken: string): Promise<MeetingCandidate[]> {
  const now = new Date();
  // the window start is absolute (now minus 24h): the old version
  // built host-local midnight with the server's calendar getters,
  // which moved the fetch window with the server's zone (oct 22
  // 2026). the wide start also lets late-join see meetings that
  // began earlier.
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${windowStart}&endDateTime=${endOfWeek}&$select=subject,start,end,location,onlineMeeting`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );

  if (!res.ok) return [];
  const data = await res.json();

  const candidates: MeetingCandidate[] = [];
  for (const event of data.value || []) {
    const joinUrl = event.onlineMeeting?.joinUrl || extractMeetingUrl(event.location?.displayName || "");
    const platform = detectPlatform(joinUrl || event.location?.displayName || "");

    candidates.push({
      title: event.subject || "untitled event",
      start_time: event.start?.dateTime,
      end_time: event.end?.dateTime,
      join_url: joinUrl,
      platform,
      source: "outlook",
      source_event_id: event.id,
      timezone: event.start?.timeZone,
      raw_location: event.location?.displayName,
    });
  }

  return candidates;
}

// --- notion calendar (via notion api) ---

export async function syncNotionCalendar(databaseId: string, accessToken: string): Promise<MeetingCandidate[]> {
  const now = new Date().toISOString();
  const oneWeekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: {
        and: [
          { property: "Date", date: { on_or_after: now } },
          { property: "Date", date: { on_or_before: oneWeekAhead } },
        ],
      },
    }),
  });

  if (!res.ok) return [];
  const data = await res.json();

  const candidates: MeetingCandidate[] = [];
  for (const page of data.results || []) {
    const props = page.properties || {};
    const title = props.Name?.title?.[0]?.plain_text || props.Title?.title?.[0]?.plain_text || "untitled";
    const date = props.Date?.date;
    const location = props.Location?.rich_text?.[0]?.plain_text || props.Link?.url || "";
    const joinUrl = extractMeetingUrl(location);

    candidates.push({
      title,
      start_time: date?.start,
      end_time: date?.end,
      join_url: joinUrl,
      platform: detectPlatform(joinUrl || location),
      source: "notion",
      source_event_id: page.id,
      raw_location: location,
    });
  }

  return candidates;
}

// --- apple calendar (via caldav) ---

export async function syncAppleCalendar(serverUrl: string, username: string, password: string): Promise<MeetingCandidate[]> {
  // apple calendar uses caldav. this is a simplified implementation.
  // for production, use a caldav library like tsdav or caldav-client

  const auth = btoa(`${username}:${password}`);
  const now = new Date();
  // absolute window, no host-local midnight: the server's zone must
  // not move it (oct 22 2026)
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // caldav report query
  const caldavBody = `<?xml version="1.0" encoding="utf-8"?>
    <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
      <d:prop>
        <d:getetag />
        <c:calendar-data />
      </d:prop>
      <c:filter>
        <c:comp-filter name="VCALENDAR">
          <c:comp-filter name="VEVENT">
            <c:time-range start="${windowStart.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}" end="${endOfWeek.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}" />
          </c:comp-filter>
        </c:comp-filter>
      </c:filter>
    </c:calendar-query>`;

  try {
    const res = await fetch(serverUrl, {
      method: "REPORT",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/xml; charset=utf-8",
        "Depth": "1",
      },
      body: caldavBody,
    });

    if (!res.ok) return [];

    // parse caldav response (simplified - would need ical parsing)
    const text = await res.text();
    const candidates: MeetingCandidate[] = [];

    // extract VEVENT blocks and parse them
    // this is a simplified parser - for production use ical.js or node-ical
    const events = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

    for (const eventText of events) {
      const summary = eventText.match(/SUMMARY:(.*)/)?.[1] || "untitled";
      // the params half matters as much as the value: DTSTART;TZID=...:...
      // says the zone the wall clock lives in. dropping it (the old bug)
      // read every local time as utc and shifted event times by the
      // source's offset (the owner, oct 22 2026).
      const dtstartM = eventText.match(/DTSTART([^:\r\n]*):(.*)/);
      const dtendM = eventText.match(/DTEND([^:\r\n]*):(.*)/);
      const location = eventText.match(/LOCATION:(.*)/)?.[1] || "";
      const description = eventText.match(/DESCRIPTION:(.*)/)?.[1] || "";

      const joinUrl = extractMeetingUrl(location) || extractMeetingUrl(description);

      candidates.push({
        title: summary,
        start_time: dtstartM ? parseICalDate(dtstartM[2], dtstartM[1]) : "",
        end_time: dtendM ? parseICalDate(dtendM[2], dtendM[1]) : undefined,
        join_url: joinUrl,
        platform: detectPlatform(joinUrl || location),
        source: "apple",
        source_event_id: eventText.match(/UID:(.*)/)?.[1] || "",
        raw_location: location,
      });
    }

    return candidates;
  } catch {
    return [];
  }
}

// an ical datetime, honestly. the shape decides everything:
//   ...Z        utc: absolute, verbatim.
//   TZID=zone:  a wall clock in a named zone: shiftWallClock walks the
//               zone's real offset (DST included), so the event sits at
//               the moment the author meant, not the server's guess.
//   floating:   no zone anywhere. the calendar's own zone (env) if set,
//               else utc with a warn: never a silent server-zone shift.
export function parseICalDate(dateStr: string, params = ""): string {
  const value = dateStr.trim().replace(/\r$/, "");
  // date only: YYYYMMDD, all-day. midnight utc is the convention; an
  // all-day event has no wall-clock moment to shift.
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`;
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/);
  if (!m) return "";
  const [, y, mo, d, h, mi, sec, zulu] = m;
  if (zulu) return `${y}-${mo}-${d}T${h}:${mi}:${sec || "00"}Z`;
  const wall = `${y}-${mo}-${d}T${h}:${mi}:${sec || "00"}`;
  const tzid = params.match(/TZID="?([^";]+)"?/)?.[1];
  if (tzid) {
    try {
      return shiftWallClock(wall, tzid);
    } catch {
      console.warn(`prixie: ical TZID "${tzid}" unresolvable; falling back to utc for ${wall}`);
      return `${wall}Z`;
    }
  }
  const calTz = Deno.env.get("APPLE_CALDAV_TZ") || "";
  if (calTz) {
    try {
      return shiftWallClock(wall, calTz);
    } catch {
      // fall through to the utc fallback
    }
  }
  console.warn(`prixie: ical floating time ${wall} with no TZID and no APPLE_CALDAV_TZ; read as utc, never as server-local`);
  return `${wall}Z`;
}

// --- shared utilities ---

export function extractMeetingUrl(text: string, hangoutLink?: string): string | undefined {
  if (hangoutLink) return hangoutLink;

  if (!text) return undefined;

  const patterns = [
    // bare zoom.us/j/... is the canonical join link zoom sends; the subdomain
    // form (company.zoom.us) is the account vanity link. both are joins.
    /https:\/\/zoom\.us\/[^\s]+/i,
    /https:\/\/[a-z0-9-]+\.zoom\.us\/[^\s]+/i,
    /https:\/\/meet\.google\.com\/[^\s]+/i,
    /https:\/\/teams\.microsoft\.com\/[^\s]+/i,
    /https:\/\/discord\.gg\/[^\s]+/i,
    /https:\/\/discord\.com\/[^\s]+/i,
    /https:\/\/[a-z0-9-]+\.bluejeans\.com\/[^\s]+/i,
    /https:\/\/[a-z0-9-]+\.ringcentral\.com\/[^\s]+/i,
    /https:\/\/[a-z0-9-]+\.webex\.com\/[^\s]+/i,
    /https:\/\/twitch\.tv\/[^\s]+/i,
    /https:\/\/[a-z0-9-]+\.zcal\.to\/[^\s]+/i,
    /https:\/\/cal\.com\/[^\s]+/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return undefined;
}

export function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("zoom.us")) return "zoom";
  if (lower.includes("meet.google.com")) return "google_meet";
  if (lower.includes("teams.microsoft.com")) return "teams";
  if (lower.includes("discord.gg") || lower.includes("discord.com")) return "discord";
  if (lower.includes("bluejeans.com")) return "bluejeans";
  if (lower.includes("ringcentral.com")) return "ringcentral";
  if (lower.includes("webex.com")) return "webex";
  if (lower.includes("twitch.tv")) return "twitch";
  if (lower.includes("cal.com")) return "calcom";   // cal video / cal.com booking rooms
  if (lower.includes("zcal.to")) return "zcal";
  return "custom";
}

// --- cal.com (booking pages) ---

// cal.com's public api v2. an api key (cal_api_key_...) is enough for the
// organizer's own bookings; the version header is what keeps the endpoint
// stable while v2 evolves (the docs' pinned date, not "latest").
//
// bookings here are already-committed meetings with a person, which is the
// point: prixie reads the calendar she booked THROUGH, not only the calendar
// the booking landed in.
const CALCOM_API = "https://api.cal.com/v2";
const CALCOM_API_VERSION = "2024-08-13";

export interface CalComBooking {
  uid: string;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  metadata?: Record<string, unknown>;
}

// one cal.com booking -> one candidate. the join link hides in any of three
// places depending on how the event type was built, so all three are read.
export function calComBookingToCandidate(booking: CalComBooking): MeetingCandidate {
  const text = [booking.location, booking.description, JSON.stringify(booking.metadata ?? {})]
    .filter(Boolean)
    .join(" ");
  const joinUrl = extractMeetingUrl(text);
  return {
    title: booking.title || "cal.com booking",
    start_time: booking.startTime ?? "",
    end_time: booking.endTime,
    join_url: joinUrl,
    platform: detectPlatform(joinUrl || booking.location || ""),
    source: "calcom",
    source_event_id: booking.uid,
    raw_location: booking.location,
  };
}

export async function syncCalCom(apiKey: string): Promise<MeetingCandidate[]> {
  if (!apiKey) return [];

  const res = await fetch(`${CALCOM_API}/bookings?status=upcoming`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "cal-api-version": CALCOM_API_VERSION,
    },
  });

  if (!res.ok) {
    console.warn(`prixie: cal.com bookings fetch failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const bookings: CalComBooking[] = data.data ?? data.bookings ?? [];
  return bookings.map(calComBookingToCandidate).filter(c => c.start_time);
}

// --- zcal (booking pages) ---

// zcal has no public booking api. two real routes, both already wired in this
// backend, so zcal works without pretending an api exists:
//
// 1. zcal writes the booking into the host's connected google/outlook
//    calendar, so the existing adapters pick it up (the reliable route).
// 2. zcal's confirmation mail carries the join link, so the inbox monitor
//    sees it. parseZcalBooking handles the payload a zapier/webhook
//    ("new booking" trigger) forwards, for the direct route.
//
// what is NOT claimed: a zcal bookings endpoint. there isn't one.
export interface ZcalBooking {
  title?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  location?: string;
  meeting_url?: string;
  uid?: string;
  url?: string;
}

export function parseZcalBooking(booking: ZcalBooking): MeetingCandidate {
  const joinUrl = booking.meeting_url ||
    extractMeetingUrl([booking.location, booking.description].filter(Boolean).join(" "));
  return {
    title: booking.title || "zcal booking",
    start_time: booking.start_time ?? "",
    end_time: booking.end_time,
    join_url: joinUrl,
    platform: detectPlatform(joinUrl || booking.location || ""),
    source: "zcal",
    source_event_id: booking.uid || booking.url || joinUrl || booking.start_time || "unknown",
    raw_location: booking.location,
  };
}

// --- unified sync ---

export async function syncAllCalendars(config: {
  google?: { calendarId: string };
  outlook?: { accessToken: string };            // microsoft calendar
  notion?: { databaseId: string; accessToken: string };
  apple?: { serverUrl: string; username: string; password: string };
  calcom?: { apiKey: string };
  zcal?: { bookings: ZcalBooking[] };            // pushed (webhook / zapier), not pulled
}): Promise<MeetingCandidate[]> {
  const all: MeetingCandidate[] = [];

  if (config.google) {
    try {
      const g = await syncGoogleCalendar(config.google.calendarId);
      all.push(...g);
    } catch (e) { console.warn("google calendar sync failed:", e); }
  }

  if (config.outlook) {
    try {
      const o = await syncOutlookCalendar(config.outlook.accessToken);
      all.push(...o);
    } catch (e) { console.warn("outlook calendar sync failed:", e); }
  }

  if (config.notion) {
    try {
      const n = await syncNotionCalendar(config.notion.databaseId, config.notion.accessToken);
      all.push(...n);
    } catch (e) { console.warn("notion calendar sync failed:", e); }
  }

  if (config.apple) {
    try {
      const a = await syncAppleCalendar(config.apple.serverUrl, config.apple.username, config.apple.password);
      all.push(...a);
    } catch (e) { console.warn("apple calendar sync failed:", e); }
  }

  if (config.calcom) {
    try {
      const c = await syncCalCom(config.calcom.apiKey);
      all.push(...c);
    } catch (e) { console.warn("cal.com booking sync failed:", e); }
  }

  // zcal arrives pushed: a zapier/webhook "new booking" triggers this call
  // with the payload. the pull sources above cannot see it, which is why
  // route 1 (its event in the host calendar) exists.
  if (config.zcal?.bookings?.length) {
    all.push(...config.zcal.bookings.map(parseZcalBooking).filter(c => c.start_time));
  }

  // deduplicate by source_event_id
  const seen = new Set<string>();
  return all.filter(c => {
    const key = `${c.source}:${c.source_event_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
