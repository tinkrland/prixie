// connections: the identity anchors (anne, oct 29 2026).
//
// the point of this file: a surface knows a HANDLE (an email address, a
// discord id, a whatsapp number) and needs to know WHO that is, so a
// reconnect is a continuation instead of a cold start. "bts has the
// connected person's discord username + email fields predefined so it's
// not a brand new person she's joining on."
//
// the anchors are CONFIGURATION, not code: PRIXIE_CONNECTIONS is a JSON
// array in env (one connection: an id, a label, an owner flag, and the
// handles it holds per platform). real handles never appear in the
// repo (same rule as every other identifying value), and unset config
// means no anchors, which means every session stays unanchored. that is
// the honest failure direction: an unknown person is treated as
// unknown, never guessed at.
//
// the python mirror lives at retelldb/models/connections.py on the
// context branch. the two must agree on normalization, or the same
// person resolves differently on the write side and the read side.

export interface Connection {
  id: string;
  label: string;
  // owner = HER OWN accounts (her gmail, her discord). her own words
  // are never mistaken for a stranger's.
  owner?: boolean;
  // handles[platform] = the handles this person holds there. more than
  // one is normal (two discord accounts, a personal and a work email).
  handles: Record<string, string[]>;
}

// the platforms the anchors cover. the python side classes these too
// (private / meeting / public_social / website); the class decides
// privacy, not the brand name.
export const PLATFORMS = [
  "zoom",
  "google_meet",
  "teams",
  "discord",
  "slack",
  "whatsapp",
  "imessage",
  "telegram",
  "email",
  "phone",
  "twitch",
  "kick",
  "youtube",
  "website",
] as const;

export type Platform = (typeof PLATFORMS)[number];

const PRIVATE_PLATFORMS = new Set([
  "discord",
  "slack",
  "whatsapp",
  "imessage",
  "telegram",
  "email",
  "phone",
]);
const MEETING_PLATFORMS = new Set(["zoom", "google_meet", "teams"]);
const PUBLIC_SOCIAL_PLATFORMS = new Set(["twitch", "kick", "youtube"]);

export type PlatformClass = "private" | "meeting" | "public_social" | "website" | "unknown";

// the class decides what carries over: a meeting capture never surfaces
// on a public social surface, whoever asks. an unknown platform is
// unknown on purpose (the caller gets "unknown", not a default).
export function platformClass(platform: string | undefined | null): PlatformClass {
  if (!platform) return "unknown";
  const p = platform.trim().toLowerCase();
  if (PRIVATE_PLATFORMS.has(p)) return "private";
  if (MEETING_PLATFORMS.has(p)) return "meeting";
  if (PUBLIC_SOCIAL_PLATFORMS.has(p)) return "public_social";
  if (p === "website") return "website";
  return "unknown";
}

// per-platform normalization. the rule both sides share: whatever makes
// two handles the SAME handle gets folded; whatever is identity-bearing
// is never touched.
//
//  - emails (and platforms whose identity IS an email): lowercase, trim
//  - phones (whatsapp/imessage/telegram/phone): digits, keeping a
//    leading + when it was written
//  - discord: ids are digits and case-insensitive usernames fold to
//    lowercase (a username can change; an id cannot)
//  - slack: user ids are case-sensitive-ish but never contain spaces;
//    trim only (never fold case: slack ids are uppercase and folding
//    would collide with handles that are not ids)
//  - everything else: lowercase + trim
export function normalizeHandle(platform: string, handle: string): string {
  const p = (platform || "").trim().toLowerCase();
  const h = (handle || "").trim();
  if (!h) return "";
  if (p === "email" || p === "zoom" || p === "google_meet" || p === "teams") {
    return h.toLowerCase();
  }
  if (p === "whatsapp" || p === "imessage" || p === "telegram" || p === "phone") {
    const plus = h.startsWith("+") ? "+" : "";
    return plus + h.replace(/[^\d]/g, "");
  }
  if (p === "slack") return h;
  return h.toLowerCase();
}

// the config loader. JSON in env, validated hard: a malformed config
// means NO connections (fail closed, warn loudly) rather than a partial
// set that silently anchors the wrong person.
export function parseConnections(raw: string | undefined): Connection[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("prixie: PRIXIE_CONNECTIONS is not valid json; running with no anchors");
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn("prixie: PRIXIE_CONNECTIONS is not an array; running with no anchors");
    return [];
  }
  const out: Connection[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as Partial<Connection>;
    if (!c.id || typeof c.id !== "string") continue;
    const handles: Record<string, string[]> = {};
    for (const [platform, list] of Object.entries(c.handles || {})) {
      if (!Array.isArray(list)) continue;
      const cleaned = list.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      if (cleaned.length) handles[platform] = cleaned;
    }
    out.push({
      id: c.id,
      label: typeof c.label === "string" ? c.label : c.id,
      owner: c.owner === true,
      handles,
    });
  }
  return out;
}

export function loadConnections(): Connection[] {
  return parseConnections(Deno.env.get("PRIXIE_CONNECTIONS"));
}

export interface Resolution {
  connection: Connection | null;
  // why not, when not. kept so a caller can log an honest reason
  // instead of silently treating a person as a stranger.
  reason: "anchored" | "no_config" | "unknown_handle" | "ambiguous";
}

// resolve who holds this handle on this platform. ambiguity (two
// anchors claiming one handle) resolves to NOBODY: an ambiguous anchor
// is worse than an honest stranger, same rule as the host reading.
export function resolveConnection(
  platform: string,
  handle: string | undefined | null,
  connections?: Connection[],
): Resolution {
  const list = connections ?? loadConnections();
  if (!list.length) return { connection: null, reason: "no_config" };
  const want = normalizeHandle(platform, handle || "");
  if (!want) return { connection: null, reason: "unknown_handle" };
  const matches = list.filter((c) =>
    (c.handles[platform] || []).some((h) => normalizeHandle(platform, h) === want)
  );
  if (matches.length === 1) return { connection: matches[0], reason: "anchored" };
  if (matches.length > 1) return { connection: null, reason: "ambiguous" };
  return { connection: null, reason: "unknown_handle" };
}
