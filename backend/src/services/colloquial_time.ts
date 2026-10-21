// colloquial time parsing: "3pm est", "tomorrow at 2:30 pt", "in 20 min".
// people put meeting times in prose: the invite email says "see you at 3pm
// eastern", the discord message says "starting in 15 min". the calendar
// adapters already convert their own structured times; this module handles
// the prose.
//
// output is honest: { iso } when a time was found with a timezone, or a
// partial match with a stated gap (time with no zone, date with no time),
// or null when nothing time-shaped is in the text at all. callers decide
// what a partial is worth; the parser never invents a timezone.

export interface ColloquialTime {
  iso?: string; // complete: date + clock time + zone, converted to utc
  matched: string; // the phrase that matched, for showing our work
  partial?: "time-no-zone" | "date-no-time"; // what's missing, if anything
}

// the timezone table: us-centric abbreviations because that's the prose
// she actually reads, plus utc/ist for the remote-world cases. standard vs
// daylight is resolved by the target date itself (a "3pm est" in july
// really means 3pm in new york; the label, not the offset, is the truth).
const TZ_TABLE: Record<string, string> = {
  est: "America/New_York", edt: "America/New_York", et: "America/New_York",
  eastern: "America/New_York",
  cst: "America/Chicago", cdt: "America/Chicago", ct: "America/Chicago",
  central: "America/Chicago",
  mst: "America/Denver", mdt: "America/Denver", mt: "America/Denver",
  mountain: "America/Denver",
  pst: "America/Los_Angeles", pdt: "America/Los_Angeles", pt: "America/Los_Angeles",
  pacific: "America/Los_Angeles",
  akst: "America/Anchorage", akdt: "America/Anchorage",
  hst: "Pacific/Honolulu", hawaii: "Pacific/Honolulu",
  utc: "UTC", gmt: "UTC", z: "UTC",
  bst: "Europe/London", ist: "Asia/Kolkata", cet: "Europe/Paris", cest: "Europe/Paris",
};

// offset minutes for a named zone on a date (the dst answer). era-accurate
// us/eu rules via Intl, which is how deno ships it.
function zoneOffsetMinutes(date: Date, timeZone: string): number | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = dtf.formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch {
    return null; // unknown zone name: caller keeps the partial
  }
}

const ZONE_RE = `(?:${Object.keys(TZ_TABLE).join("|")})`;

export function parseColloquialTime(text: string, now = new Date()): ColloquialTime | null {
  if (!text) return null;

  // relative first: "in 20 min", "in an hour and a half", "in 2 hours".
  // relative beats absolute: "see you in 10" is the live meaning.
  const rel = text.match(
    /\bin\s+(\d+|an?)\s*(min(?:ute)?s?|hrs?|hours?|h)\b/i,
  );
  if (rel) {
    const n = /^(a|an)$/i.test(rel[1]) ? 1 : parseInt(rel[1], 10);
    const unit = /^h/i.test(rel[2]) ? 60 : 1;
    const iso = new Date(now.getTime() + n * unit * 60000).toISOString();
    return { iso, matched: rel[0] };
  }

  // the date part: "today", "tomorrow", "tonight", an explicit date
  // (10/25, oct 25), or nothing (meaning today).
  let dateMatch: Date | null = null;
  const day = text.match(/\b(today|tonight|tomorrow|tmrw?)\b/i);
  if (day) {
    dateMatch = new Date(now);
    if (!/today|tonight/i.test(day[1])) dateMatch.setDate(dateMatch.getDate() + 1);
  }
  const md = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (md) {
    dateMatch = new Date(now.getFullYear(), parseInt(md[2], 10) - 1, parseInt(md[1], 10));
    // a date already past must be next year's: nobody schedules the past
    if (dateMatch.getTime() < now.getTime() - 86400000) dateMatch.setFullYear(dateMatch.getFullYear() + 1);
  }

  // the clock part: "3pm", "2:30pm", "14:30", "3 pm eastern", "at 5".
  const clock = text.match(
    new RegExp(
      `\\b(?:(\\d{1,2}):(\\d{2})|(\\d{1,2}))\\s*(am|pm)?\\s*(${ZONE_RE})?\\b`,
      "i",
    ),
  );
  if (!clock) {
    return dateMatch
      ? { matched: (day?.[0] || md?.[0] || "") as string, partial: "date-no-time", iso: undefined }
      : null;
  }
  const matched = (clock[0] as string).trim();

  let hour = clock[3] ? parseInt(clock[3], 10) : parseInt(clock[1], 10);
  const minute = clock[2] ? parseInt(clock[2], 10) : 0;

  // bare "at 5" (no am/pm) only counts in plausible meeting hours: 8-11
  // reads as evening (5pm-11pm), the rest as morning. a bare "3" would
  // be a section number, not a time, so a bare hour under 8 is not a time.
  const hasMeridiem = Boolean(clock[4]);
  if (!hasMeridiem && !clock[2] && hour >= 1 && hour <= 11 && !/at\s/i.test(text)) {
    return dateMatch ? { matched: (day?.[0] || "") as string, partial: "date-no-time" } : null;
  }
  if (!hasMeridiem && !clock[2] && (hour < 1 || hour > 11) && hour <= 12 && !/at\s/i.test(text)) {
    return null; // "chapter 9" is not a time
  }

  if (hasMeridiem) {
    if (/pm/i.test(clock[4]) && hour < 12) hour += 12;
    if (/am/i.test(clock[4]) && hour === 12) hour = 0;
  } else if (hour <= 12 && hour >= 1 && hour < 8 && clock[2]) {
    // 24h clock reading: "14:30" stays, "2:30" without am/pm reads pm
    hour += 12;
  }

  const zoneLabel = clock[5]?.toLowerCase().replace(/\.$/, "");
  if (!zoneLabel) {
    return { matched, partial: "time-no-zone", iso: undefined };
  }
  const zone = TZ_TABLE[zoneLabel];

  // convert in the source zone, and only then ask "did it pass?". the
  // comparison happens in utc, not in the sandbox's local clock: a
  // "3pm est" must not roll to tomorrow just because the server sits in
  // a zone where it's already thursday.
  const toUtc = (base: Date): string | null => {
    const candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute);
    const offset = zoneOffsetMinutes(candidate, zone);
    if (offset === null) return null;
    return new Date(candidate.getTime() - offset * 60000).toISOString();
  };

  const base = dateMatch || now;
  let iso = toUtc(base);
  if (iso === null) return { matched, partial: "time-no-zone", iso: undefined };

  // no explicit date and the converted time already passed: it's the
  // next occurrence. "join at 9pm" sent at 11pm means tomorrow.
  if (!dateMatch && Date.parse(iso) < now.getTime()) {
    const next = new Date(base);
    next.setDate(next.getDate() + 1);
    iso = toUtc(next);
  }

  return { iso: iso || undefined, matched };
}
