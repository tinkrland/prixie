// timezone awareness service
// parses colloquial timezone references and converts to proper IANA timezone strings

const TZ_ALIASES: Record<string, string> = {
  // us
  "est": "America/New_York",
  "eastern": "America/New_York",
  "et": "America/New_York",
  "edt": "America/New_York",
  "cst": "America/Chicago",
  "central": "America/Chicago",
  "ct": "America/Chicago",
  "cdt": "America/Chicago",
  "mst": "America/Denver",
  "mountain": "America/Denver",
  "mt": "America/Denver",
  "mdt": "America/Denver",
  "pst": "America/Los_Angeles",
  "pacific": "America/Los_Angeles",
  "pt": "America/Los_Angeles",
  "pdt": "America/Los_Angeles",
  "akst": "America/Anchorage",
  "akdt": "America/Anchorage",
  "alaska": "America/Anchorage",
  "hst": "Pacific/Honolulu",
  "hawaii": "Pacific/Honolulu",
  "ht": "Pacific/Honolulu",

  // india
  "ist": "Asia/Kolkata",
  "india": "Asia/Kolkata",
  "indian": "Asia/Kolkata",
  "indian standard time": "Asia/Kolkata",

  // uk
  "gmt": "Europe/London",
  "utc": "UTC",
  "bst": "Europe/London",
  "london": "Europe/London",
  "uk": "Europe/London",
  "british": "Europe/London",

  // europe
  "cet": "Europe/Paris",
  "central european": "Europe/Paris",
  "cest": "Europe/Paris",
  "eet": "Europe/Athens",
  "eest": "Europe/Athens",
  "berlin": "Europe/Berlin",
  "paris": "Europe/Paris",
  "amsterdam": "Europe/Amsterdam",
  "madrid": "Europe/Madrid",
  "rome": "Europe/Rome",
  "athens": "Europe/Athens",

  // asia
  "jst": "Asia/Tokyo",
  "japan": "Asia/Tokyo",
  "tokyo": "Asia/Tokyo",
  "kst": "Asia/Seoul",
  "korea": "Asia/Seoul",
  "seoul": "Asia/Seoul",
  "sgt": "Asia/Singapore",
  "singapore": "Asia/Singapore",
  "hkt": "Asia/Hong_Kong",
  "hong kong": "Asia/Hong_Kong",
  "uae": "Asia/Dubai",
  "dubai": "Asia/Dubai",
  "gst": "Asia/Dubai",

  // australia
  "aest": "Australia/Sydney",
  "aedt": "Australia/Sydney",
  "sydney": "Australia/Sydney",
  "acst": "Australia/Adelaide",
  "acdt": "Australia/Adelaide",
  "awst": "Australia/Perth",
  "perth": "Australia/Perth",

  // misc
  "nzst": "Pacific/Auckland",
  "nz": "Pacific/Auckland",
  "new zealand": "Pacific/Auckland",
};

const CITY_TIMEZONES: Record<string, string> = {
  "new york": "America/New_York",
  "nyc": "America/New_York",
  "los angeles": "America/Los_Angeles",
  "la": "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  "sf": "America/Los_Angeles",
  "chicago": "America/Chicago",
  "denver": "America/Denver",
  "seattle": "America/Los_Angeles",
  "austin": "America/Chicago",
  "dallas": "America/Chicago",
  "houston": "America/Chicago",
  "boston": "America/New_York",
  "washington": "America/New_York",
  "dc": "America/New_York",
  "miami": "America/New_York",
  "atlanta": "America/New_York",
  "phoenix": "America/Phoenix",
  "portland": "America/Los_Angeles",
  "mumbai": "Asia/Kolkata",
  "delhi": "Asia/Kolkata",
  "bangalore": "Asia/Kolkata",
  "london": "Europe/London",
  "berlin": "Europe/Berlin",
  "paris": "Europe/Paris",
  "tokyo": "Asia/Tokyo",
  "singapore": "Asia/Singapore",
  "sydney": "Australia/Sydney",
  "dubai": "Asia/Dubai",
  "toronto": "America/Toronto",
  "vancouver": "America/Vancouver",
};

// extract timezone from colloquial text
export function extractTimezone(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // check direct aliases
  if (TZ_ALIASES[lower]) return TZ_ALIASES[lower];

  // check for "in <timezone>" pattern
  const inMatch = lower.match(/(?:in|at)\s+([a-z\s]+?)(?:\s+(?:time|timezone|tz))?(?:[\s,\.]|$)/);
  if (inMatch) {
    const candidate = inMatch[1].trim();
    if (TZ_ALIASES[candidate]) return TZ_ALIASES[candidate];
    if (CITY_TIMEZONES[candidate]) return CITY_TIMEZONES[candidate];
  }

  // check city names
  for (const [city, tz] of Object.entries(CITY_TIMEZONES)) {
    if (lower.includes(city)) return tz;
  }

  // check all aliases
  for (const [alias, tz] of Object.entries(TZ_ALIASES)) {
    if (lower.includes(alias)) return tz;
  }

  return null;
}

// convert a wall-clock time in a source timezone to UTC (the owner, oct 21
// 2026: the old version IGNORED sourceTz and parsed in whatever zone
// the server happened to run in, which silently scheduled meetings
// hours off. a server in utc reading "3pm est" stored 3pm utc. this
// one computes the offset for the actual date in the actual zone, so
// DST is honored too: "2:30pm" on nov 1 2026 in America/New_York is a
// different utc instant than the same clock time a week later.
export function convertToUTC(timeStr: string, sourceTz: string): string {
  try {
    // already an absolute time (ISO with offset or Z): nothing to convert
    const direct = new Date(timeStr);
    if (!isNaN(direct.getTime()) && /T\d{2}:\d{2}/.test(timeStr)) {
      return direct.toISOString();
    }

    // wall-clock time: pin a date (today in the source zone), then find
    // the utc instant whose wall clock in sourceTz matches. the offset
    // is read from Intl for that exact instant, so DST flips are right.
    const zone = validZone(sourceTz);
    const todayInZone = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());

    // parse "3:00 PM" / "15:00" against the pinned date
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    let hour: number, minute: number;
    if (m) {
      hour = parseInt(m[1]);
      minute = parseInt(m[2]);
      const ampm = m[3]?.toLowerCase();
      if (ampm === "pm" && hour < 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;
      if (hour > 23) throw new Error(`bad hour: ${timeStr}`);
    } else {
      // a date+time string ("2026-11-01 2:30 PM", "2026-11-01 14:30",
      // "2026-11-01T14:30"): a wall clock in the source zone. no
      // today-prefixing, the date is in the string. split date from
      // clock, normalize the clock, rejoin.
      const dm = timeStr.trim().match(/^(\d{4}-\d{2}-\d{2})[T\s]+(.+)$/);
      if (!dm) throw new Error(`unparseable time: ${timeStr}`);
      let clock = dm[2].trim().replace(/\s+/g, " ").replace(/(am|pm)/i, " $1").trim().toUpperCase();
      const cm = clock.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/);
      if (!cm) throw new Error(`unparseable time: ${timeStr}`);
      let h = parseInt(cm[1]);
      const min = cm[2];
      if (cm[4] === "PM" && h < 12) h += 12;
      if (cm[4] === "AM" && h === 12) h = 0;
      return shiftWallClock(`${dm[1]}T${String(h).padStart(2, "0")}:${min}:${cm[3] || "00"}`, zone);
    }

    return shiftWallClock(`${todayInZone}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`, zone);
  } catch {
    // honest: an unparseable time is NOT a guessed one. callers must
    // treat a non-ISO return as a failure, never store it as a time.
    return timeStr;
  }
}

// is this an IANA zone (or UTC alias)? no key/unknown zone = throw, so
// the caller fails honestly rather than scheduling in a guessed zone.
function validZone(tz: string): string {
  if (!tz || typeof tz !== "string") throw new Error("no timezone given");
  const normalized = tz.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized });
    return normalized;
  } catch {
    throw new Error(`unknown timezone: ${tz}`);
  }
}

// find the utc instant for a wall-clock datetime in zone: walk the
// offset, using Intl to read the zone's offset at each candidate.
// exported for the ical parser: a wall-clock time in a named zone -> utc
export function shiftWallClock(wallClock: string, zone: string): string {
  const wall = new Date(wallClock + "Z"); // treat as utc first
  if (isNaN(wall.getTime())) throw new Error(`unparseable: ${wallClock}`);
  // offset of zone at the wall time (treated as utc) in minutes
  const off = zoneOffsetMinutes(wall, zone);
  const utcGuess = new Date(wall.getTime() - off * 60 * 1000);
  // verify and correct once: dst edges can move the offset between the
  // guess and the wall time
  const off2 = zoneOffsetMinutes(utcGuess, zone);
  const utc = new Date(wall.getTime() - off2 * 60 * 1000);
  return utc.toISOString();
}

function zoneOffsetMinutes(instant: Date, zone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value || "0");
  const asUTC = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour") % 24, get("minute"), get("second"),
  );
  return (asUTC - instant.getTime()) / 60000;
}

// parse a colloquial time reference
// "tomorrow at 3pm est" -> ISO 8601
// "friday 9am pacific" -> ISO 8601
// "in 2 hours" -> ISO 8601
export function parseColloquialTime(text: string): { time: string; timezone: string | null } {
  const lower = text.toLowerCase();
  const now = new Date();

  // extract timezone first
  const tz = extractTimezone(text);

  // "in X hours/minutes"
  const relativeMatch = lower.match(/in\s+(\d+)\s+(hour|minute|hr|min)/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2];
    const ms = unit.startsWith("hour") || unit.startsWith("hr") ? amount * 60 * 60 * 1000 : amount * 60 * 1000;
    return { time: new Date(now.getTime() + ms).toISOString(), timezone: tz };
  }

  // "tomorrow at X"
  const tomorrowMatch = lower.match(/tomorrow.*?(\d{1,2})[:\s]?(\d{2})?\s*(am|pm)?/);
  if (tomorrowMatch) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const hours = parseInt(tomorrowMatch[1]);
    const minutes = tomorrowMatch[2] ? parseInt(tomorrowMatch[2]) : 0;
    const ampm = tomorrowMatch[3];
    const finalHours = ampm === "pm" && hours < 12 ? hours + 12 : ampm === "am" && hours === 12 ? 0 : hours;
    tomorrow.setHours(finalHours, minutes, 0, 0);
    return { time: tomorrow.toISOString(), timezone: tz };
  }

  // "monday", "tuesday", etc.
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const targetDay = i;
      const currentDay = now.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7; // next week

      const target = new Date(now);
      target.setDate(target.getDate() + diff);

      // try to extract time
      const timeMatch = lower.match(/(\d{1,2})[:\s]?(\d{2})?\s*(am|pm)?/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const ampm = timeMatch[3];
        const finalHours = ampm === "pm" && hours < 12 ? hours + 12 : ampm === "am" && hours === 12 ? 0 : hours;
        target.setHours(finalHours, minutes, 0, 0);
      }

      return { time: target.toISOString(), timezone: tz };
    }
  }

  // default: try to parse as-is
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return { time: parsed.toISOString(), timezone: tz };
  }

  return { time: now.toISOString(), timezone: tz };
}
