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

import { shiftWallClock } from "./timezone.ts";

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
  // (10/25, oct 25), or nothing (meaning today). it is carried as a
  // token, not a Date: a Date needs a zone, and building it with the
  // local constructor is how the double-subtract happened (below).
  let dateKind: "none" | "today" | "tomorrow" | "explicit" = "none";
  let explicitMonth = 0, explicitDay = 0;
  const day = text.match(/\b(today|tonight|tomorrow|tmrw?)\b/i);
  if (day) {
    dateKind = /today|tonight/i.test(day[1]) ? "today" : "tomorrow";
  }
  const md = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (md) {
    dateKind = "explicit";
    // m/d, us convention, as the comment has always said: "10/25" is
    // oct 25. the old version handed md[2] to the month slot, which
    // rolled the date years into the future (a Date built with month
    // 24 is oct 2028, not oct 2026).
    explicitMonth = parseInt(md[1], 10);
    explicitDay = parseInt(md[2], 10);
  }
  // the clock scan runs on the text WITHOUT the date phrase: without
  // this, "10/25 at 10am ist" matched the date's "10" as the clock and
  // the actual "10am ist" was never read (oct 22 2026).
  const textForClock = md ? text.replace(md[0], "  ") : text;

  // the clock part: "3pm", "2:30pm", "14:30", "3 pm eastern", "at 5".
  const clock = textForClock.match(
    new RegExp(
      `\\b(?:(\\d{1,2}):(\\d{2})|(\\d{1,2}))\\s*(am|pm)?\\s*(${ZONE_RE})?\\b`,
      "i",
    ),
  );
  if (!clock) {
    return dateKind !== "none"
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
    return dateKind !== "none" ? { matched: (day?.[0] || md?.[0] || "") as string, partial: "date-no-time" } : null;
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

  // the conversion (the owner, oct 22 2026: the double-subtract fix). the
  // clock is a wall clock in the SOURCE ZONE, so the calendar day it
  // sits on is the zone's day too, read with Intl. the old version
  // built the candidate with the local Date constructor (baking the
  // server's zone into the instant) and then subtracted the zone
  // offset on top: on a utc server the two happened to cancel, but on
  // any other server "3pm est" lost the offset twice and landed at
  // 23:00Z, and ist/cet drifted by the server offset. shiftWallClock
  // applies the zone exactly once, server-independent.
  const dayInZone = (instant: Date): string =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(instant);

  const clock24 = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const toUtc = (dayStr: string): string | null => {
    try {
      return shiftWallClock(`${dayStr}T${clock24}`, zone);
    } catch {
      return null;
    }
  };

  if (dateKind === "explicit") {
    const year = parseInt(dayInZone(now).slice(0, 4), 10);
    const mm = String(explicitMonth).padStart(2, "0");
    const dd = String(explicitDay).padStart(2, "0");
    let iso = toUtc(`${year}-${mm}-${dd}`);
    // a date already past must be next year's: nobody schedules the past
    if (iso && Date.parse(iso) < now.getTime() - 86400000) {
      iso = toUtc(`${year + 1}-${mm}-${dd}`);
    }
    return iso ? { iso, matched } : { matched, partial: "time-no-zone", iso: undefined };
  }

  // today in the zone, or tomorrow in the zone (now + 24h read through
  // the zone's calendar: a dst edge can make the wall clock 23 or 25
  // hours away, and for prose that is the honest answer)
  const baseDay = dateKind === "tomorrow"
    ? dayInZone(new Date(now.getTime() + 86400000))
    : dayInZone(now);

  let iso = toUtc(baseDay);
  if (iso === null) return { matched, partial: "time-no-zone", iso: undefined };

  // no explicit date and the converted time already passed: it's the
  // next occurrence. "join at 9pm" sent at 11pm means tomorrow. the
  // comparison happens in utc, not in the sandbox's local clock.
  if (dateKind === "none" && Date.parse(iso) < now.getTime()) {
    iso = toUtc(dayInZone(new Date(now.getTime() + 86400000)));
  }

  return { iso: iso || undefined, matched };
}
