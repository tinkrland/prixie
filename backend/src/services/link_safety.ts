// link safety: the honest threat model (the owner, oct 21 2026).
//
// she never browses freestyle: the only urls she ever visits are (1)
// meeting join urls from her sources, (2) the attendance form url the owner
// set, (3) links that matched a capture request in a live chat, (4)
// links from whitelisted forwarded mail. but a hostile participant can
// paste a link in meeting chat that matches a capture keyword, or a
// whitelisted sender's mail can carry a poisoned link. so every url she
// opens passes this gate first, and the gate fails CLOSED: an unsafe
// link is skipped and reported, never visited.
//
// what this catches without any third party: scheme tricks (javascript:,
// data:), credential-in-url lures (https://zoom.us@evil.com), raw-ip
// and exotic-port hosts, punycode homoglyph domains (xn--).
// what needs a key: GOOGLE_SAFE_BROWSING_API_KEY adds google's
// threat-match lookup; no key = that layer is skipped, logged once,
// never faked.

export interface LinkVerdict {
  safe: boolean;
  reason: string;
}

const BLOCKED_SCHEMES = /^(javascript|data|vbscript|file|blob):/i;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080"]);

// pure: the local verdict, no network. strict, fast, honest.
export function localLinkVerdict(rawUrl: string): LinkVerdict {
  const url = (rawUrl || "").trim();

  if (BLOCKED_SCHEMES.test(url)) {
    return { safe: false, reason: "scheme is not http(s)" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "not a parseable url" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `scheme ${parsed.protocol} not allowed` };
  }

  // https://trusted.example@evil.com/ tricks the eye, not the parser
  if (parsed.username || parsed.password) {
    return { safe: false, reason: "credentials embedded in the url" };
  }

  const host = parsed.hostname.toLowerCase();

  // raw ip hosts: a zoom link is a domain, an ip host is a probe
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { safe: false, reason: "host is a raw/local address" };
  }

  // punycode: xn-- is a homoglyph domain in disguise
  if (host.includes("xn--")) {
    return { safe: false, reason: "punycode host (possible homoglyph)" };
  }

  if (!ALLOWED_PORTS.has(parsed.port)) {
    return { safe: false, reason: `port ${parsed.port} not allowed` };
  }

  return { safe: true, reason: "ok" };
}

let warnedNoSafeBrowsing = false;

// network layer, optional: google safe browsing threat matches. only
// called after the local verdict passed. no key = skip, warn once.
async function safeBrowsingVerdict(url: string): Promise<LinkVerdict> {
  const key = Deno.env.get("GOOGLE_SAFE_BROWSING_API_KEY");
  if (!key) {
    if (!warnedNoSafeBrowsing) {
      console.warn("prixie: no GOOGLE_SAFE_BROWSING_API_KEY, that layer is off");
      warnedNoSafeBrowsing = true;
    }
    return { safe: true, reason: "ok (safe browsing layer off)" };
  }

  try {
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
      },
    );
    if (!res.ok) {
      // the lookup failing is not evidence of danger, but also not
      // evidence of safety: she proceeds with the local verdict only.
      console.warn(`prixie: safe browsing lookup failed: ${res.status}`);
      return { safe: true, reason: "ok (safe browsing unavailable)" };
    }
    const data = await res.json();
    if (data.matches && data.matches.length > 0) {
      const threats = data.matches.map((m: any) => m.threatType).join(", ");
      return { safe: false, reason: `flagged by safe browsing: ${threats}` };
    }
    return { safe: true, reason: "ok (safe browsing clean)" };
  } catch (err: any) {
    console.warn(`prixie: safe browsing lookup errored: ${err.message}`);
    return { safe: true, reason: "ok (safe browsing unavailable)" };
  }
}

// the gate. every url she opens passes through here.
export async function assertLinkSafe(url: string): Promise<LinkVerdict> {
  const local = localLinkVerdict(url);
  if (!local.safe) return local;
  return await safeBrowsingVerdict(url);
}
