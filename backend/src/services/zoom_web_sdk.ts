// the zoom web sdk: the answer to "why can't we use that?".
//
// we can. recall's limits were recall's, not zoom's. the zoom MEETING web
// sdk embeds a real zoom client (the same web client a browser joiner
// gets) in a page we host: prixie's join engine (browserbase) loads that
// page and she is a PARTICIPANT, not a bot watching a transcript. what that
// unlocks over the bot path:
//
// - chat in and out (send/receive, including to everyone or dm)
// - reactions, and raise hand: the web sdk raises the same hand everyone
//   else in the meeting sees. the "she does not raise her hand" line in
//   the readme was true for the bot path, not for this one.
// - the mandatory post-join popup questions render in the web client,
//   which browser automation can see and answer. the recall bot could not
//   be asked; she can.
// - in-meeting q&a: zoom's q&a panel is webinar-scoped. honest line: if
//   the meeting has it, it renders in the client like any other panel and
//   the automation tries; no promises were made beyond that.
//
// how a join happens here:
//   1. parse the join url -> meeting number + passcode (pwd= in the url or
//      embedded; the zoom.us/j/<number> shape is the identifier)
//   2. the backend signs the join (sdk key/secret, HMAC-SHA256 below) so
//      the page can call ZoomMtg.join with role 0 (participant)
//   3. the browserbase session loads the hosted page (website/ join page,
//      same app the site already serves) which runs @zoomus/websdk
//   4. camera off, mic off, name: prixie. the popup question, if any,
//      shows up in that page and is answered there.
//
// the hosted page's seams (what the browserbase automation calls on
// it, all name-spaced prixie* so they are hers and hers only):
//   window.prixieAttendees() -> attendee list (roles readable)
//   window.prixieSendChat(message, toName?)
//     -> Promise<"sent-dm" | "sent-everyone" |
//                 "recipient-not-found" | "send-failed" | "no-chat">
//     toName resolves against the attendee list and the matched
//     userId rides ZoomMtg.sendChat; no toName = everyone. the host's
//     "participants can chat with" setting is the honest gate: a host
//     who blocks private chat makes the page answer send-failed, and
//     the CALLER chooses the fallback, not the seam. a dm that would
//     quietly fall back to the whole room is a leak, never a feature.
//   window.prixieShareScreen("start" | "stop")
//     -> Promise<"started" | "stopped" | "failed">
//   window.prixieRaiseHand() -> Promise<boolean> (the sdk raises the
//     same hand everyone else in the meeting sees)
//   window.prixieReact(reaction) -> Promise<boolean> (the sdk's own
//     reaction call; the name is normalized by the caller)
//   window.prixieScreensharer() -> string | null (who is presenting,
//     tracked from the sdk's onShareContentChange / onUserUpdate
//     bShareScreen events; null = nobody. note from the sdk docs: a
//     REMOTE share reports sharingType "unknown", so the page tracks
//     the sharer's NAME from the events, never the surface)
//     ZoomMtg.shareScreen underneath; what she shares from the cloud
//     browser is the page's own view (canvas renders), per the
//     screenshare design: no standing vm, the show-and-tell moment is
//     on demand.
//
// credentials: ZOOM_SDK_KEY + ZOOM_SDK_SECRET (a zoom "meeting sdk" app
// type in the zoom marketplace). the signature math below is the classic
// meeting-sdk signature: HMAC-SHA256 over base64(header).payload with the
// sdk secret. newer sdk versions also allow an oauth (pkce) join; when
// that is what the hosted page runs, the signature step is replaced by
// the oauth handshake and this module only parses + plans. verify against
// the sdk version the page pins.

export interface ZoomJoinParts {
  meetingNumber: string;
  passcode?: string;
}

export function parseZoomJoinUrl(joinUrl: string): ZoomJoinParts | null {
  const m = joinUrl.match(/zoom\.us\/j\/(\d+)/i) || joinUrl.match(/zoom\.us\/x\/(\d+)/i);
  if (!m) return null;

  const parts: ZoomJoinParts = { meetingNumber: m[1] };
  try {
    const pwd = new URL(joinUrl).searchParams.get("pwd");
    if (pwd) parts.passcode = pwd;
  } catch {
    // not a parseable url: the number is still the join identifier
  }
  return parts;
}

// the classic meeting-sdk signature:
//   payload = base64(json header).json payload
//   signature = base64(header.payload + "." + base64(HMAC-SHA256(message, sdkSecret)))
// role 0 = participant, role 1 = host.
export async function generateSdkSignature(
  meetingNumber: string,
  role: 0 | 1,
  sdkKey: string,
  sdkSecret: string,
  now = Date.now(),
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sdkKey,
    mn: meetingNumber,
    role,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 60 * 60, // the sdk wants ~23h max; an hour per join is plenty
    tokenExp: Math.floor(now / 1000) + 60 * 60,
  };

  const b64 = (bytes: Uint8Array): string => {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const enc = new TextEncoder();
  const message = `${b64(enc.encode(JSON.stringify(header)))}.${b64(enc.encode(JSON.stringify(payload)))}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sdkSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));

  return `${message}.${b64(sig)}`;
}

// the join plan: what the browserbase session needs to make her a
// participant. data until the engine runs it.
export interface ZoomWebSdkJoinPlan {
  meetingNumber: string;
  passcode?: string;
  // the hosted page that runs @zoomus/websdk, with its query params
  pageUrl: string;
  signatureEndpoint: string; // POST -> { signature } for this meeting number
  name: string;
  role: 0 | 1;
  cameraOff: boolean;
  micOff: boolean;
}

export function zoomWebSdkJoinPlan(
  joinUrl: string,
  opts: { name?: string; pageBase?: string } = {},
): ZoomWebSdkJoinPlan | null {
  const parts = parseZoomJoinUrl(joinUrl);
  if (!parts) return null;

  const base = opts.pageBase || Deno.env.get("ZOOM_SDK_PAGE_URL") ||
    "https://prixie.ai/join-zoom";

  const query = new URLSearchParams({ mn: parts.meetingNumber, name: opts.name || "prixie" });
  if (parts.passcode) query.set("pwd", parts.passcode);

  return {
    meetingNumber: parts.meetingNumber,
    passcode: parts.passcode,
    pageUrl: `${base}?${query.toString()}`,
    signatureEndpoint: "/api/zoom/signature",
    name: opts.name || "prixie",
    role: 0,
    cameraOff: true,
    micOff: true,
  };
}
