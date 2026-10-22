// theurltell: where a url really goes, told by her, not by a site.
//
// the links she reads (chats, mail, forms) come padded with marketing:
// shorteners (bit.ly), redirect chains, utm trackers. wheregoes.com
// and friends trace chains for you, but using one hands the url to a
// third party and the verdict becomes theirs. she does not do that.
// theurltell is her own robust alternative: it walks the http
// redirect chain itself (no third party, no javascript, no renderer,
// no cookies) and reports the destination site. and she only ever
// GOES to the destination: the shortener hop and its marketing
// pixels are told, never opened in a session (the owner, oct 22 2026).
//
// what the tell is: header reading. every hop is a fetch with
// redirect: "manual", so a 301/302's Location is READ, not followed
// by an engine that could load anything. the one non-http redirect
// honored is the meta refresh, parsed out of the html source, never
// executed. javascript hops (window.location) are out of scope and
// honestly so: a chain that only moves via script ends at its html
// page.
//
// the gate composition: every hop (the start, each redirect, the
// meta refresh) re-runs link_safety's local verdict, so a chain
// that bends toward javascript:, raw ips, or credential lures dies
// mid-tell. the caller then runs the full gate on the destination,
// because the destination is the only url a session ever opens.

import { localLinkVerdict } from "../link_safety.ts";

export interface Hop {
  url: string;
  status: number;
}

export interface UrlTell {
  verdict: "clear" | "blocked" | "not-a-link";
  reason: string;
  // the only url any session should ever open. null when not clear.
  destination: string | null;
  // every hop, told honestly, in order
  chain: Hop[];
  // the marketing params people pad links with, removed. they are
  // analytics, not routing: they never even get the ping.
  trackersStripped: string[];
}

export interface TellOptions {
  // injectable, so tests ride fakes and never touch the network
  fetchImpl?: typeof fetch;
  maxHops?: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_HOPS = 12;
const HOP_TIMEOUT_MS = 8000;
// a hostile final page could serve an endless body; the meta refresh
// lives at the top of the html, so the first 64k is plenty to read
const META_SNIFF_LIMIT = 65536;

const TRACKING_PREFIXES = ["utm_", "utm-"];
const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "gbraid", "wbraid", "msclkid", "dclid", "twclid",
  "ttclid", "yclid", "ysclid", "mc_cid", "mc_eid", "igshid", "igsh",
  "_hsenc", "_hsmi", "oly_anon_id", "oly_enc_id", "vero_id", "wickedid",
  "rb_clickid", "s_kwcid", "li_fat_id", "mkt_tok", "trk_contact",
  "trk_msg", "trk_id", "spell", "spm_id", "ig_cache_key",
]);

// pure: the marketing params, removed. conservative on purpose: only
// params that exist for tracking go; routing params stay.
export function stripTrackingParams(rawUrl: string): { url: string; removed: string[] } {
  try {
    const u = new URL(rawUrl);
    const removed: string[] = [];
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key) || TRACKING_PREFIXES.some((p) => key.toLowerCase().startsWith(p))) {
        u.searchParams.delete(key);
        removed.push(key);
      }
    }
    return { url: u.toString(), removed };
  } catch {
    return { url: rawUrl, removed: [] };
  }
}

// pure: one redirect hop, resolved against the current url. null =
// no hop to follow.
export function nextHopUrl(
  currentUrl: string,
  status: number,
  location: string | null,
): string | null {
  if (!REDIRECT_STATUSES.has(status) || !location) return null;
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    return null;
  }
}

// the meta refresh, parsed from source, never executed
const META_REFRESH = /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?[^"'>]*url=([^"'>]+)/i;
export function metaRefreshTarget(html: string, baseUrl: string): string | null {
  const m = html.match(META_REFRESH);
  if (!m) return null;
  const raw = m[1].trim().replace(/["'>]+$/, "");
  try {
    return new URL(decodeURIComponent(raw), baseUrl).toString();
  } catch {
    return null;
  }
}

async function readBounded(res: Response, limit = META_SNIFF_LIMIT): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  try {
    await reader.cancel();
  } catch {
    // cancelling a finished stream is not an error worth telling
  }
  const merged = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, merged.byteLength - offset);
    merged.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= merged.byteLength) break;
  }
  return new TextDecoder().decode(merged);
}

function done(
  verdict: UrlTell["verdict"],
  reason: string,
  chain: Hop[],
  trackers: Set<string>,
  destination: string | null,
): UrlTell {
  return { verdict, reason, destination, chain, trackersStripped: [...trackers] };
}

// the walk. one call, the whole truth of the url.
export async function theUrlTell(rawUrl: string, opts: TellOptions = {}): Promise<UrlTell> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxHops = opts.maxHops ?? MAX_HOPS;
  const trackers = new Set<string>();
  const chain: Hop[] = [];
  const seen = new Set<string>();

  // the start gate: scheme tricks and parse failures die here
  const startGate = localLinkVerdict(rawUrl);
  if (!startGate.safe) {
    const verdict = startGate.reason === "not a parseable url" ? "not-a-link" : "blocked";
    return done(verdict, startGate.reason, chain, trackers, null);
  }

  // tracking params are stripped before the first request: they are
  // analytics for the destination, not routing for the tell
  const start = stripTrackingParams(rawUrl);
  for (const r of start.removed) trackers.add(r);
  let current = start.url;
  seen.add(current);

  let getFallback = false; // a HEAD-hostile hop gets one GET retry
  for (let hop = 0; hop < maxHops; hop++) {
    let res: Response;
    try {
      res = await doFetch(current, {
        redirect: "manual",
        method: getFallback ? "GET" : "HEAD",
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
      });
      if ((res.status === 405 || res.status === 501) && !getFallback) {
        getFallback = true;
        hop--; // the retry is the same hop, not a new one
        continue;
      }
      getFallback = false;
    } catch {
      return done("blocked", `chain broke at ${current}`, chain, trackers, null);
    }
    chain.push({ url: current, status: res.status });

    if (REDIRECT_STATUSES.has(res.status)) {
      const next = nextHopUrl(current, res.status, res.headers.get("location"));
      if (!next) {
        return done("blocked", `redirect at ${current} carried no usable location`, chain, trackers, null);
      }
      const nextGate = localLinkVerdict(next);
      if (!nextGate.safe) {
        return done("blocked", `redirect points where she does not go: ${nextGate.reason}`, chain, trackers, null);
      }
      const nextStripped = stripTrackingParams(next);
      for (const r of nextStripped.removed) trackers.add(r);
      if (seen.has(nextStripped.url)) {
        return done("blocked", "redirect loop", chain, trackers, null);
      }
      seen.add(nextStripped.url);
      current = nextStripped.url;
      continue;
    }

    if (res.status >= 400) {
      return done("blocked", `chain landed on http ${res.status}`, chain, trackers, null);
    }

    // 2xx: the end of the http chain. one bounded read, for the meta
    // refresh only, then the verdict is final either way
    if ((res.headers.get("content-type") ?? "").includes("text/html")) {
      const html = await readBounded(res).catch(() => "");
      const meta = metaRefreshTarget(html, current);
      if (meta) {
        const metaGate = localLinkVerdict(meta);
        if (!metaGate.safe) {
          return done("blocked", `meta refresh points where she does not go: ${metaGate.reason}`, chain, trackers, null);
        }
        const metaStripped = stripTrackingParams(meta);
        for (const r of metaStripped.removed) trackers.add(r);
        if (seen.has(metaStripped.url)) {
          return done("blocked", "redirect loop", chain, trackers, null);
        }
        seen.add(metaStripped.url);
        current = metaStripped.url;
        continue;
      }
    }
    return done("clear", `ok through ${chain.length} hop(s)`, chain, trackers, current);
  }

  return done("blocked", `more than ${maxHops} hops, not a chain but a maze`, chain, trackers, null);
}
