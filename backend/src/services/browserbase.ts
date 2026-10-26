// browserbase service - the universal join engine. opens the meeting URL in a
// headless browser, automates the join flow, captures audio, watches the chat

const BROWSERBASE_API_KEY = Deno.env.get("BROWSERBASE_API_KEY")!;
const BROWSERBASE_BASE = "https://api.browserbase.com/v1";

export interface BrowserbaseSession {
  id: string;
  status: string;
  createdAt: string;
}

export interface JoinResult {
  session_id: string;
  // joined means the in-call UI was SEEN (the owner, oct 22 2026), not that
  // a join button was clicked. waiting_room means she asked, possibly
  // more than once, and was not let in yet: never a success.
  status: "joined" | "failed" | "waiting_room";
  error?: string;
  knocks?: number; // entry attempts, first ask included
  recording_id?: string;
}

// --- session management ---

export async function createSession(options?: {
  projectId?: string;
  keepalive?: boolean;
  viewport?: { width: number; height: number };
  timeoutSeconds?: number;
}): Promise<BrowserbaseSession> {
  const res = await fetch(`${BROWSERBASE_BASE}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BROWSERBASE_API_KEY}`,
    },
    body: JSON.stringify({
      projectId: options?.projectId || Deno.env.get("BROWSERBASE_PROJECT_ID") || undefined,
      keepalive: options?.keepalive ?? true,
      ...(options?.timeoutSeconds ? { timeout: options.timeoutSeconds } : {}),
      browserSettings: {
        viewport: options?.viewport || { width: 1280, height: 800 },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`browserbase session creation failed: ${err}`);
  }

  return res.json();
}

export async function navigateTo(sessionId: string, url: string): Promise<void> {
  const res = await fetch(`${BROWSERBASE_BASE}/sessions/${sessionId}/navigate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BROWSERBASE_API_KEY}`,
    },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    throw new Error(`navigation failed: ${res.statusText}`);
  }

  // the consent policy rides every navigation (the owner, oct 22 2026): a
  // banner she sees anywhere is a banner she declines. one bounded
  // walk per page load, never throws: a page with no banner pays one
  // quiet read.
  try {
    await dismissConsentBanners(sessionId);
  } catch {
    // a consent walk that fails changed nothing: nothing was agreed to
  }
}

// the page's text, read through cdp. used by the pre-join reads (the
// participant count gate) and anything else that needs to see what the
// page shows rather than what it owns.
export async function readPageText(sessionId: string): Promise<string> {
  const result = await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: "document.body?.innerText || ''",
    returnByValue: true,
  });
  return result?.result?.value || "";
}

export async function takeScreenshot(sessionId: string): Promise<string> {
  const res = await fetch(`${BROWSERBASE_BASE}/sessions/${sessionId}/screenshot`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${BROWSERBASE_API_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`screenshot failed: ${res.statusText}`);
  }

  const data = await res.json();
  return data.screenshotId || data.url || "";
}

export async function stopSession(sessionId: string): Promise<void> {
  await fetch(`${BROWSERBASE_BASE}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${BROWSERBASE_API_KEY}` },
  });
}

export async function getSessionStatus(sessionId: string): Promise<any> {
  const res = await fetch(`${BROWSERBASE_BASE}/sessions/${sessionId}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${BROWSERBASE_API_KEY}` },
  });
  return res.json();
}

// --- CDP (Chrome DevTools Protocol) actions ---
//
// the transport rewrite (oct 26 2026): the http relay
// (POST /v1/sessions/{id}/cdp) is gone from the live api, it 404s.
// the documented way is the session's signed connect url, a websocket
// carrying raw cdp. browser-level domains (Target.*) answer there
// directly; page domains need a target attach first (flatten: true)
// and then ride the same socket with the sessionId field. connections
// are cached per session and dropped on close; a call on a dead
// connection reconnects once. the return shape is the cdp message
// ({id, result} or {id, error}), same as the relay used to return,
// so every existing caller is unchanged.

interface CdpConnection {
  ws: WebSocket;
  msgId: number;
  pending: Map<number, (msg: any) => void>;
  targetSessionId?: string; // the main (meeting) page target
  targetSessions: Map<string, string>; // extra targets (the share tab): targetId -> cdp sessionId
  closed: boolean;
}

const cdpConnections = new Map<string, CdpConnection>();

// the transport seam: the expressions and commands are what is under
// test, the websocket is live-verified against the real api (oct 26:
// navigate, captureScreenshot, evaluate, multi-tab). tests inject a
// fake sender here; production leaves it unset and rides the socket.
export type CdpSend = (sessionId: string, method: string, params: any) => Promise<any>;
let injectedCdpSend: CdpSend | null = null;
export function injectCdpSend(fn: CdpSend): void {
  injectedCdpSend = fn;
}
export function resetCdpSend(): void {
  injectedCdpSend = null;
}

export function buildCdpMessage(
  msgId: number,
  method: string,
  params: any,
  targetSessionId?: string,
): Record<string, unknown> {
  const message: Record<string, unknown> = { id: msgId, method, params };
  if (targetSessionId) message.sessionId = targetSessionId;
  return message;
}

export function pickPageTarget(targetInfos: any[]): any | null {
  return (targetInfos || []).find((t) => t?.type === "page") ?? null;
}

async function openCdpConnection(sessionId: string): Promise<CdpConnection> {
  const sres = await fetch(`${BROWSERBASE_BASE}/sessions/${sessionId}`, {
    headers: { "Authorization": `Bearer ${BROWSERBASE_API_KEY}` },
  });
  if (!sres.ok) throw new Error(`session fetch failed: ${sres.status}`);
  const session = await sres.json();
  if (!session?.connectUrl) throw new Error("session has no connect url (already ended?)");

  const ws = new WebSocket(session.connectUrl);
  const conn: CdpConnection = { ws, msgId: 0, pending: new Map(), targetSessions: new Map(), closed: false };
  const opened = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("cdp connect timeout")), 15_000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(); });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("cdp connect failed")); });
  });
  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg?.id && conn.pending.has(msg.id)) {
        conn.pending.get(msg.id)!(msg);
        conn.pending.delete(msg.id);
      }
    } catch { /* a malformed frame never kills the connection */ }
  });
  ws.addEventListener("close", () => {
    conn.closed = true;
    if (cdpConnections.get(sessionId) === conn) cdpConnections.delete(sessionId);
    // anything still waiting gets an honest null, not a hang
    for (const resolve of conn.pending.values()) resolve(null);
    conn.pending.clear();
  });
  await opened;
  return conn;
}

async function cdpRaw(conn: CdpConnection, method: string, params: any = {}): Promise<any> {
  const id = ++conn.msgId;
  return new Promise<any>((resolve) => {
    conn.pending.set(id, resolve);
    conn.ws.send(JSON.stringify(buildCdpMessage(id, method, params)));
  });
}

async function ensureCdpTarget(conn: CdpConnection): Promise<void> {
  if (conn.targetSessionId) return;
  const targets = await cdpRaw(conn, "Target.getTargets");
  const page = pickPageTarget(targets?.result?.targetInfos);
  if (!page?.targetId) throw new Error("no page target in the session");
  const attach = await cdpRaw(conn, "Target.attachToTarget", { targetId: page.targetId, flatten: true });
  conn.targetSessionId = attach?.result?.sessionId;
  if (!conn.targetSessionId) throw new Error("target attach failed");
}

export async function cdpExecute(sessionId: string, method: string, params: any): Promise<any> {
  if (injectedCdpSend) return injectedCdpSend(sessionId, method, params);
  try {
    let conn = cdpConnections.get(sessionId);
    if (!conn || conn.closed) {
      conn = await openCdpConnection(sessionId);
      cdpConnections.set(sessionId, conn);
    }
    await ensureCdpTarget(conn);
    const id = ++conn.msgId;
    return await new Promise<any>((resolve) => {
      conn!.pending.set(id, resolve);
      try {
        conn!.ws.send(JSON.stringify(buildCdpMessage(id, method, params, conn!.targetSessionId)));
      } catch {
        conn!.pending.delete(id);
        resolve(null);
      }
    });
  } catch (e) {
    console.error(`cdp ${method} failed:`, (e as Error)?.message || e);
    return null;
  }
}

// --- the share tab: a second tab in the SAME session ---
//
// the link share opens the presented url as a new tab beside the
// meeting tab (not a second session): same browser, so the meeting
// tab and the share tab can speak localhost webrtc to each other
// and one connection carries both. the meeting tab stays the main
// target for every existing helper; these run against a chosen tab.

export async function createTabInSession(sessionId: string, url: string): Promise<string | null> {
  const conn = await cdpConn(sessionId);
  const created = await cdpRaw(conn, "Target.createTarget", { url });
  const targetId = created?.result?.targetId;
  if (!targetId) return null;
  const attach = await cdpRaw(conn, "Target.attachToTarget", { targetId, flatten: true });
  const cdpSession = attach?.result?.sessionId;
  if (!cdpSession) return null;
  conn.targetSessions.set(targetId, cdpSession);
  return targetId;
}

export async function closeTabInSession(sessionId: string, targetId: string): Promise<void> {
  try {
    const conn = await cdpConn(sessionId);
    await cdpRaw(conn, "Target.closeTarget", { targetId });
    conn.targetSessions.delete(targetId);
  } catch { /* the tab dies with the session anyway */ }
}

// execute a cdp command against a specific tab of the session
export async function cdpExecuteInTarget(
  sessionId: string,
  targetId: string,
  method: string,
  params: any,
): Promise<any> {
  if (injectedCdpSend) return injectedCdpSend(sessionId, method, params);
  try {
    const conn = await cdpConn(sessionId);
    let cdpSession = conn.targetSessions.get(targetId);
    if (!cdpSession) {
      const attach = await cdpRaw(conn, "Target.attachToTarget", { targetId, flatten: true });
      cdpSession = attach?.result?.sessionId;
      if (!cdpSession) return null;
      conn.targetSessions.set(targetId, cdpSession);
    }
    const id = ++conn.msgId;
    return await new Promise<any>((resolve) => {
      conn.pending.set(id, resolve);
      try {
        conn.ws.send(JSON.stringify(buildCdpMessage(id, method, params, cdpSession)));
      } catch {
        resolve(null);
      }
    });
  } catch (e) {
    console.error(`cdp ${method} (target) failed:`, (e as Error)?.message || e);
    return null;
  }
}

async function cdpConn(sessionId: string): Promise<CdpConnection> {
  let conn = cdpConnections.get(sessionId);
  if (!conn || conn.closed) {
    conn = await openCdpConnection(sessionId);
    cdpConnections.set(sessionId, conn);
  }
  return conn!;
}

// the out-loud ask (the owner's q&a flow): unmute and speak, from inside
// the hosted join page. the page seam is a window.prixieUnmute helper
// when the page defines one, otherwise the zoom mic button. the voice
// itself is the page's speech synthesis; the honest caveat: whether the
// synthesized audio reaches the meeting depends on the page's mic
// wiring (a custom audio track when the sdk allows it). if neither the
// helper nor the mic button is there, this returns false and the
// caller falls back to asking in the chat. the camera is never part
// of this: there is no camera branch in the flow at all.
export async function unmuteAndSpeakInSession(sessionId: string, question: string): Promise<boolean> {
  // obs mode (the owner, oct 21 2026): the mic track IS the obs virtual mic.
  // masky's livekit publish -> obs -> virtual mic carries her audio, so
  // the page only unmutes; making sound here would double-speak.
  if (resolveAudioMode() === "obs") {
    const result = await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: `
        (() => {
          if (typeof window.prixieUnmute === "function") { window.prixieUnmute(); return "unmuted"; }
          const btn = document.querySelector('button[aria-label*="mute" i], button[aria-label*="audio" i], button[aria-label*="join audio" i]');
          if (btn) { btn.click(); return "unmuted"; }
          return "no_mic";
        })()
      `,
      returnByValue: true,
    });
    const ok = result?.result?.value === "unmuted";
    if (ok) console.log("prixie: obs audio mode, mic unmuted; audio arrives via the obs virtual mic");
    return ok;
  }

  // JSON.stringify is the only escaping that covers every case.
  const result = await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `
      (() => {
        let unmuted = false;
        if (typeof window.prixieUnmute === "function") { window.prixieUnmute(); unmuted = true; }
        else {
          const btn = document.querySelector('button[aria-label*="mute" i], button[aria-label*="audio" i], button[aria-label*="join audio" i]');
          if (btn) { btn.click(); unmuted = true; }
        }
        if (!unmuted) return "no_mic";
        try {
          const u = new SpeechSynthesisUtterance(${JSON.stringify(question)});
          u.rate = 1.0;
          window.speechSynthesis.speak(u);
          return "speaking";
        } catch (e) { return "speech_failed"; }
      })()
    `,
    returnByValue: true,
  });
  const value = result?.result?.value;
  return value === "speaking" || value === "speech_failed";
}

// --- element interaction (via CDP) ---

export async function findAndClick(sessionId: string, selector: string, timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // the selector is JSON.stringify'd into the expression: a selector is
    // untrusted string data, and a stray quote in one (input[value*="it's"])
    // must never become live javascript. the "clicked" sentinel also fixes
    // the old shape, where el?.click() returns undefined and the
    // `|| 'not found'` reported a successful click as a miss.
    const result = await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: `const el = document.querySelector(${JSON.stringify(selector)}); if (el) { el.click(); 'clicked'; } else { 'not found'; }`,
      returnByValue: true,
    });

    if (result?.result?.value === "clicked") {
      return true;
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  return false;
}

// elementExists: a findAndType that never types. the redeem flow uses it
// to probe for credit card fields before filling anything: finding one
// is a hard stop, not something to write into.
export async function elementExists(sessionId: string, selector: string, timeoutMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(selector)}) !== null`,
      returnByValue: true,
    });
    if (result?.result?.value === true) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export async function findAndType(sessionId: string, selector: string, text: string, timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // JSON.stringify is the only escaping that covers every case: quotes,
    // backslashes, newlines, unicode. hand-rolled replace chains leak.
    const result = await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: `
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) {
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          'typed';
        } else {
          'not found';
        }
      `,
      returnByValue: true,
    });

    if (result?.result?.value === "typed") {
      return true;
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  return false;
}

// --- platform-specific join flows ---

export async function joinDiscord(sessionId: string, meetingUrl: string, profileName: string): Promise<JoinResult> {
  // navigate to the discord invite/channel
  await navigateTo(sessionId, meetingUrl);

  // wait for page to load
  await new Promise(r => setTimeout(r, 5000));

  // try to find and click the "Join Voice" or voice channel button
  // discord voice channels have a specific structure
  const joinedVoice = await findAndClick(sessionId, '[data-list-item-id*="voice"]', 15000) ||
                       await findAndClick(sessionId, 'button[aria-label*="Voice"]', 10000) ||
                       await findAndClick(sessionId, 'button[aria-label*="Join"]', 10000);

  if (!joinedVoice) {
    // might need to handle discord auth first
    const hasLogin = await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: `!!document.querySelector('input[name="email"]')`,
      returnByValue: true,
    });

    if (hasLogin?.result?.value) {
      // the wall: discord wants a login the engine cannot walk past.
      // the kernel handoff owns exactly this moment: kernel logs in on
      // prixie's own account (bitwarden copy or the owner once), the
      // discord-domain cookies cross to this session, and she reloads
      // signed in. back on browserbase, one retry, no more.
      const handoff = await handoffLoginToKernel("discord.com,discordapp.com", sessionId);
      if (handoff.status === "authenticated") {
        await navigateTo(sessionId, meetingUrl);
        await new Promise(r => setTimeout(r, 5000));
        const retried = await findAndClick(sessionId, '[data-list-item-id*="voice"]', 15000) ||
                        await findAndClick(sessionId, 'button[aria-label*="Voice"]', 10000);
        if (retried) {
          return { session_id: sessionId, status: "joined" };
        }
        return { session_id: sessionId, status: "failed", error: "kernel handoff logged her in but the voice channel still was not found" };
      }
      const why = handoff.status === "disabled"
        ? "discord requires authentication and the kernel login handoff is not configured (KERNEL_API_KEY unset)"
        : handoff.status === "needs-user"
          ? `discord login needs the owner once: ${handoff.hostedUrl}`
          : `kernel login handoff failed: ${handoff.reason}`;
      return { session_id: sessionId, status: "failed", error: why };
    }

    return { session_id: sessionId, status: "failed", error: "could not find voice channel to join" };
  }

  return { session_id: sessionId, status: "joined" };
}

export async function joinBlueJeans(sessionId: string, meetingUrl: string, profileName: string): Promise<JoinResult> {
  await navigateTo(sessionId, meetingUrl);
  await new Promise(r => setTimeout(r, 5000));

  // bluejeans: click "Join Meeting" or enter name first
  const nameInput = await findAndType(sessionId, 'input[name="name"], input[placeholder*="name"], input[placeholder*="Name"]', profileName, 10000);

  const joinButton = await findAndClick(sessionId, 'button[class*="join"], button[aria-label*="Join"], button:has-text("Join")', 10000) ||
                      await findAndClick(sessionId, 'button[type="submit"]', 5000);

  if (!joinButton) {
    return { session_id: sessionId, status: "failed", error: "could not find join button on bluejeans" };
  }

  return { session_id: sessionId, status: "joined" };
}

export async function joinRingCentral(sessionId: string, meetingUrl: string, profileName: string): Promise<JoinResult> {
  await navigateTo(sessionId, meetingUrl);
  await new Promise(r => setTimeout(r, 5000));

  // ringcentral often prompts to download the app. click "Join from browser" instead
  const joinFromBrowser = await findAndClick(sessionId, 'a:has-text("Join from browser"), button:has-text("Join from browser"), a[class*="browser"]', 10000);

  // enter name
  await findAndType(sessionId, 'input[name="name"], input[placeholder*="name"], input[placeholder*="Name"]', profileName, 8000);

  // click join
  const joinButton = await findAndClick(sessionId, 'button[class*="join"], button[aria-label*="Join"], button[type="submit"]', 10000);

  if (!joinButton) {
    return { session_id: sessionId, status: "failed", error: "could not find join button on ringcentral" };
  }

  return { session_id: sessionId, status: "joined" };
}

export async function joinGeneric(sessionId: string, meetingUrl: string, profileName: string): Promise<JoinResult> {
  await navigateTo(sessionId, meetingUrl);
  await new Promise(r => setTimeout(r, 5000));

  // try common patterns: enter name, click join
  await findAndType(sessionId, 'input[name="name"], input[placeholder*="name"], input[placeholder*="Name"], input[name="username"]', profileName, 8000);

  const joined = await findAndClick(sessionId, 'button[class*="join"], button[aria-label*="Join"], button[type="submit"], button:has-text("Join"), button:has-text("Enter")', 10000);

  if (!joined) {
    return { session_id: sessionId, status: "failed", error: "could not find join button on generic platform" };
  }

  return { session_id: sessionId, status: "joined" };
}

// --- main join dispatcher ---

export async function joinMeeting(
  platform: string,
  meetingUrl: string,
  profileName: string
): Promise<JoinResult> {
  const session = await createSession({ keepalive: true });

  try {
    let result: JoinResult;

    switch (platform) {
      case "discord":
        result = await joinDiscord(session.id, meetingUrl, profileName);
        break;
      case "bluejeans":
        result = await joinBlueJeans(session.id, meetingUrl, profileName);
        break;
      case "ringcentral":
        result = await joinRingCentral(session.id, meetingUrl, profileName);
        break;
      case "zoom":
        result = await joinZoom(session.id, meetingUrl, profileName);
        break;
      case "google_meet":
      case "meet":
        result = await joinGoogleMeet(session.id, meetingUrl, profileName);
        break;
      case "teams":
      case "msteams":
      case "microsoft_teams":
        result = await joinTeams(session.id, meetingUrl, profileName);
        break;
      default:
        result = await joinGeneric(session.id, meetingUrl, profileName);
    }

    return result;
  } catch (err: any) {
    await stopSession(session.id);
    return { session_id: session.id, status: "failed", error: err.message };
  }
}

// --- audio capture via CDP ---

export async function startAudioCapture(sessionId: string): Promise<boolean> {
  // use CDP to capture tab audio
  const result = await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: false
          });
          window.__prixieAudioStream = stream;
          return 'captured';
        } catch (e) {
          return 'error: ' + e.message;
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  });

  return result?.result?.value === "captured";
}

// --- recording ---

export async function getSessionRecordings(sessionId: string): Promise<any[]> {
  const res = await fetch(`${BROWSERBASE_BASE}/sessions/${sessionId}/recordings`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${BROWSERBASE_API_KEY}` },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

// --- transcript from recording ---

export async function getRecordingUrl(sessionId: string): Promise<string | null> {
  const recordings = await getSessionRecordings(sessionId);
  if (recordings.length === 0) return null;

  const recording = recordings[0];
  return recording.url || recording.downloadUrl || null;
}

// --- text-based element finder (more resilient than css selectors for join buttons) ---

export async function findAndClickByText(sessionId: string, texts: string[], selectorScope = "button, a, div[role='button']", timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: `
        (() => {
          const candidates = Array.from(document.querySelectorAll(${JSON.stringify(selectorScope)}));
          const wanted = ${JSON.stringify(texts.map(t => t.toLowerCase()))};
          for (const el of candidates) {
            const label = (el.textContent || el.getAttribute("aria-label") || "").trim().toLowerCase();
            if (!label || label.length > 60) continue;
            if (wanted.some(w => label === w || label.includes(w))) {
              el.click();
              return "clicked";
            }
          }
          return "not found";
        })()
      `,
      returnByValue: true,
    });

    if (result?.result?.value === "clicked") return true;
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}

// --- honest entry: "asked" is not "in" (the owner, oct 22 2026) ---
// a meeting used to be marked success the moment she clicked
// "ask to join". that click is a knock, not entry. entry is the
// in-call UI: the leave/end controls every platform renders once she
// is actually inside. the probe reads the page and says one of
// entered / waiting / unknown, and the knock loop re-asks while
// nobody answers: mods miss popups, and a little badgering is
// natural (her word), once per interval, bounded.

export const IN_CALL_TEXTS = [
  "leave call", "leave meeting", "leave the call", "end call", "end meeting",
  "leave",
];

export const WAITING_ROOM_TEXTS = [
  "ask to join", "asking to join", "request to join",
  "waiting for the host", "waiting for someone", "let you in",
  "waiting for the meeting to start", "hasn\'t approved",
];

// the texts that (re)request entry, wherever the page still offers it
export const KNOCK_TEXTS = ["ask to join", "request to join", "knock to join"];

export type EntryState = "entered" | "waiting" | "unknown";

// one page read, classified. pure shape -> probe value -> state.
export function classifyEntry(probe: string | undefined): EntryState {
  if (probe === "entered" || probe === "waiting") return probe;
  return "unknown";
}

export async function probeEntryState(sessionId: string): Promise<EntryState> {
  const result = await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `
      (() => {
        const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;
        const buttons = Array.from(document.querySelectorAll("button, div[role='button'], a"));
        const label = (el) => ((el.textContent || "") + " " + (el.getAttribute("aria-label") || "")).trim().toLowerCase();
        const has = (texts) => buttons.some((b) => visible(b) && texts.some((t) => label(b).includes(t)));
        if (has(${JSON.stringify(IN_CALL_TEXTS)})) return "entered";
        if (has(${JSON.stringify(WAITING_ROOM_TEXTS)})) return "waiting";
        // body text is the fallback marker for the limbo pages
        const body = (document.body?.innerText || "").toLowerCase();
        if (${JSON.stringify(WAITING_ROOM_TEXTS)}.some((t) => body.includes(t))) return "waiting";
        return "unknown";
      })()
    `,
    returnByValue: true,
  });
  return classifyEntry(result?.result?.value);
}

export interface EntryOutcome {
  state: EntryState;
  knocks: number; // how many times she asked in total (first click included)
}

// await entry: the knock loop. entered returns fast. waiting re-asks
// every reknockEveryMs until maxWaitMs, then reports waiting honestly:
// asked N times, never admitted. unknown is unknown.
export async function awaitEntry(
  sessionId: string,
  opts: { maxWaitMs?: number; reknockEveryMs?: number; pollMs?: number } = {},
): Promise<EntryOutcome> {
  const maxWaitMs = opts.maxWaitMs ?? 120_000;
  const reknockEveryMs = opts.reknockEveryMs ?? 30_000;
  const pollMs = opts.pollMs ?? 5_000;
  const started = Date.now();
  let knocks = 1; // the join/ask click that started this
  let last: EntryState = "unknown";
  for (;;) {
    last = await probeEntryState(sessionId);
    if (last === "entered") return { state: "entered", knocks };
    const waited = Date.now() - started;
    if (waited >= maxWaitMs) break;
    if (last === "waiting" && waited >= knocks * reknockEveryMs) {
      // nobody answered: knock again. false (button gone) is fine: the
      // next probe sees whatever changed.
      const asked = await findAndClickByText(sessionId, KNOCK_TEXTS, "button, div[role='button']", 3000);
      if (asked) knocks++;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { state: last, knocks };
}

// the verdict: entered is joined (seen, not clicked). waiting is
// waiting_room with the knock count on it. unknown is a failure with an
// honest error, never a silent success.
export function entryVerdict(sessionId: string, outcome: EntryOutcome): JoinResult {
  if (outcome.state === "entered") {
    return { session_id: sessionId, status: "joined", knocks: outcome.knocks };
  }
  if (outcome.state === "waiting") {
    return {
      session_id: sessionId,
      status: "waiting_room",
      knocks: outcome.knocks,
      error: `asked ${outcome.knocks}x, not admitted yet`,
    };
  }
  return {
    session_id: sessionId,
    status: "failed",
    knocks: outcome.knocks,
    error: "clicked join but never entered the room (entry state unknown)",
  };
}

// --- mainline platforms (zoom, meet, teams) ---

// zoom registration links (the owner, oct 22 2026): a zoom meeting behind
// registration sends a link shaped zoom.us/meeting/register/<id> (or
// webinar/register), and the real join link only exists after the
// form is filled and submitted. this is register-then-source, the
// same truth as luma: she registers first, then joins. the form
// identity is the form identity (PRIXIE_FORM_NAME / PRIXIE_FORM_EMAIL,
// never the owner's), and if zoom chooses to EMAIL the link instead of
// showing it, the flow says so and stops. no guessed links, ever.
export function isZoomRegisterUrl(url: string): boolean {
  return /https:\/\/[a-z0-9-]+\.zoom\.us\/(meeting|webinar)\/register\//i.test(url);
}

export interface ZoomRegistrationResult {
  ok: boolean;
  joinUrl?: string;
  error?: string;
}

// the join link on the confirmation page: an anchor or a copyable
// input pointing at the zoom.us/j/ (meeting) or zoom.us/w/ (webinar)
// shape. read from the dom, never constructed.
async function extractZoomJoinLink(sessionId: string): Promise<string | null> {
  const result = await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `(() => {
      const linkShape = /zoom\\.us\\/(j|w)\\//;
      for (const a of document.querySelectorAll("a[href]")) {
        if (linkShape.test(a.href)) return a.href;
      }
      for (const inp of document.querySelectorAll("input")) {
        if (inp.value && linkShape.test(inp.value)) return inp.value;
      }
      return null;
    })()`,
    returnByValue: true,
  });
  return result?.result?.value ?? null;
}

export async function registerZoom(
  sessionId: string,
  registerUrl: string,
  formName: string,
  formEmail: string,
): Promise<ZoomRegistrationResult> {
  await navigateTo(sessionId, registerUrl);
  await new Promise((r) => setTimeout(r, 6000)); // zoom pages settle slowly

  // first name / last name / email, the registration trio. zoom's
  // markup has carried more than one shape over the years, so a few
  // candidates each, first one that types wins.
  const first = formName.split(/\s+/)[0] || formName;
  const last = formName.split(/\s+/).slice(1).join(" ") || first;

  await findAndType(
    sessionId,
    'input[name="fname"], input[name="first_name"], input[id*="first" i][type="text"], input[placeholder*="first" i]',
    first,
    6000,
  );
  await findAndType(
    sessionId,
    'input[name="lname"], input[name="last_name"], input[id*="last" i][type="text"], input[placeholder*="last" i]',
    last,
    6000,
  );
  const emailTyped = await findAndType(
    sessionId,
    'input[type="email"], input[name="email"], input[placeholder*="email" i]',
    formEmail,
    6000,
  );
  if (!emailTyped) {
    return { ok: false, error: "registration form had no email field she could type" };
  }

  const submitted = await findAndClickByText(sessionId, ["register"], "button", 12000);
  if (!submitted) {
    return { ok: false, error: "no register button on the page" };
  }
  await new Promise((r) => setTimeout(r, 6000)); // let the confirmation land

  const joinUrl = await extractZoomJoinLink(sessionId);
  if (!joinUrl) {
    // honest: some zoom setups mail the link instead of showing it.
    // the agentmail path can pick it up from the inbox later; this
    // flow never guesses.
    return { ok: false, error: "confirmation page showed no join link (zoom may have emailed it)" };
  }
  return { ok: true, joinUrl };
}

export async function joinZoom(sessionId: string, meetingUrl: string, profileName: string): Promise<JoinResult> {
  await navigateTo(sessionId, meetingUrl);
  await new Promise(r => setTimeout(r, 6000));

  // passcode usually rides in the url (?pwd=). if zoom shows a passcode field, we cannot recover it here
  // enter display name
  await findAndType(sessionId, 'input[aria-label*="name" i], input#js-join-username, input[name="username"], input[placeholder*="name" i]', profileName, 10000);

  // zoom may push the app download. insist on the web client
  await findAndClickByText(sessionId, ["join from your browser", "join from browser", "launch meeting"], "a, button", 8000);

  const joined = await findAndClickByText(sessionId, ["join", "enter"], "button", 12000);
  if (!joined) {
    return { session_id: sessionId, status: "failed", error: "could not find join button on zoom web client" };
  }

  // post-join audio dialog
  await findAndClickByText(sessionId, ["join with computer audio", "join audio", "join with audio"], "button", 10000);

  return entryVerdict(sessionId, await awaitEntry(sessionId));
}

export async function joinGoogleMeet(sessionId: string, meetingUrl: string, profileName: string): Promise<JoinResult> {
  await navigateTo(sessionId, meetingUrl);
  await new Promise(r => setTimeout(r, 6000));

  // guest name entry in the green room
  await findAndType(sessionId, 'input[aria-label*="name" i], input[placeholder*="name" i]', profileName, 10000);

  // "ask to join" for locked meetings, "join now" for open ones
  const joined = await findAndClickByText(sessionId, ["join now", "ask to join"], "button, div[role='button']", 20000);
  if (!joined) {
    return { session_id: sessionId, status: "failed", error: "could not find join button on google meet green room" };
  }

  // dismiss mic/camera prompts if they appear
  await findAndClickByText(sessionId, ["join now"], "button, div[role='button']", 5000);

  return entryVerdict(sessionId, await awaitEntry(sessionId));
}

export async function joinTeams(sessionId: string, meetingUrl: string, profileName: string): Promise<JoinResult> {
  await navigateTo(sessionId, meetingUrl);
  await new Promise(r => setTimeout(r, 6000));

  // teams pushes "download teams". prefer the web join
  await findAndClickByText(sessionId, ["join on the web instead", "continue on this browser", "join on web"], "a, button, div[role='button']", 10000);

  // guest name
  await findAndType(sessionId, 'input[aria-label*="name" i], input[placeholder*="name" i], input[type="text"]', profileName, 8000);

  // possible "sign in" wall: choose to join as guest if offered
  await findAndClickByText(sessionId, ["join now", "join as a guest", "join"], "button, div[role='button']", 15000);

  // post-join device settings dialog
  await findAndClickByText(sessionId, ["join now", "join"], "button, div[role='button']", 8000);

  return entryVerdict(sessionId, await awaitEntry(sessionId));
}

// --- chat send (prixie speaking into the meeting chat) ---
//
// she can speak to the whole room or to one person (the organizer, a
// host). the dm is a first-class thing, not an accident of whatever
// recipient the panel happens to be set to.
//
// the rule that matters: a message that named a recipient is only
// ever sent to that recipient. if the recipient cannot be picked, the
// message is not sent at all. a dm that falls back to the whole room
// is a leak, so the fallback is always the CALLER's explicit choice,
// never something this function does quietly.

export interface ChatSendResult {
  sent: boolean;
  // "dm" only when a named recipient was confirmed; "everyone" when
  // the send went to the whole room; "nobody" when nothing was sent
  to: "dm" | "everyone" | "nobody";
}

// the page seam contract (the hosted join page implements it on top
// of the zoom web sdk; prixieAttendees is the same shape's list):
//   window.prixieSendChat(message, toName?)
//     -> Promise<"sent-dm" | "sent-everyone" |
//                 "recipient-not-found" | "send-failed" | "no-chat">
// toName resolves against the attendee list; the matched userId rides
// ZoomMtg.sendChat (no userId = everyone). the host's "participants
// can chat with" setting is the honest gate: when the host blocks
// private chat the page answers send-failed and the caller decides
// what to do, not the seam.

export async function sendChatInSession(
  sessionId: string,
  messageText: string,
  toName?: string,
): Promise<ChatSendResult> {
  // the page seam first: it knows the sdk's attendee shape and the
  // chat settings, so it is the only one that can CONFIRM a dm.
  // JSON.stringify produces a valid JS string literal for any payload
  const msgLiteral = JSON.stringify(messageText);
  const nameLiteral = JSON.stringify(toName ?? null);
  const seam = await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `
      (() => {
        if (typeof window.prixieSendChat !== "function") return null;
        try {
          return Promise.resolve(window.prixieSendChat(${msgLiteral}, ${nameLiteral}))
            .catch(() => "send-failed");
        } catch (e) { return "send-failed"; }
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  });
  const seamVerdict = seam?.result?.value;
  if (seamVerdict === "sent-dm") return { sent: true, to: "dm" };
  if (seamVerdict === "sent-everyone") return { sent: true, to: "everyone" };
  if (seamVerdict) {
    // the seam answered: recipient-not-found / send-failed / no-chat.
    // honest refusals, especially when a dm was requested.
    return { sent: false, to: "nobody" };
  }

  // no page seam: the generic web-client path. open the chat panel if
  // it is closed, pick the recipient if one was named, then type.
  await findAndClickByText(sessionId, ["chat", "show conversation", "conversation"], "button, div[role='button']", 6000);

  if (toName) {
    const picked = await pickChatRecipientInSession(sessionId, toName);
    if (!picked) return { sent: false, to: "nobody" };
  }

  const result = await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `
      (() => {
        const selectors = [
          'textarea[placeholder*="chat" i]',
          'textarea[aria-label*="chat" i]',
          'textarea[aria-label*="message" i]',
          'div[contenteditable="true"][role="textbox"]',
          'textarea',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            el.focus();
            el.value = ${msgLiteral};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            // send: enter keydown for most web clients
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            return "sent";
          }
        }
        return "no chat input found";
      })()
    `,
    returnByValue: true,
  });

  const sent = result?.result?.value === "sent";
  if (!sent) return { sent: false, to: "nobody" };
  // with a picked recipient the web client sends to the To: target;
  // without one it sends to whoever the panel is set to (everyone).
  return { sent: true, to: toName ? "dm" : "everyone" };
}

// best effort: open the chat panel's To: dropdown and pick the named
// participant. the web clients render different menus, so the scan is
// by role and text, never by one known selector. returns true only
// when a matching option was clicked.
export async function pickChatRecipientInSession(sessionId: string, toName: string): Promise<boolean> {
  const nameLiteral = JSON.stringify(toName);
  const result = await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `
      (() => {
        const want = ${nameLiteral}.toLowerCase();
        const openers = [...document.querySelectorAll(
          '[aria-label*="to" i], [class*="chat-to" i], [class*="recipient" i]'
        )].filter((el) => el.offsetParent !== null);
        for (const opener of openers) {
          opener.click();
          const menu = [...document.querySelectorAll('[role="option"], [role="menuitem"], li')]
            .filter((el) => el.offsetParent !== null);
          const hit = menu.find((el) => (el.textContent || "").trim().toLowerCase().includes(want));
          if (hit) { hit.click(); return "picked"; }
        }
        return "recipient-not-picked";
      })()
    `,
    returnByValue: true,
  });
  return result?.result?.value === "picked";
}

// --- screenshare management (the show-and-tell moment) ---
//
// she does not share a screen in general: joins are camera-off and
// mic-off, and a show-and-tell moment (presenting a bug, a demo) is
// the microvm's job. these seams are the on/off switch for that
// moment, so whatever flow spawns the moment can also drive the room.
// the page seam contract (the hosted sdk page implements it):
//   window.prixieShareScreen("start" | "stop")
//     -> Promise<"started" | "stopped" | "failed">
// underneath: ZoomMtg.shareScreen. what she shares from a cloud
// browser is the browser's own view (the hosted page / canvas
// render), which is exactly the design: canvas renders, no standing
// vm.

export async function setScreenshareInSession(sessionId: string, action: "start" | "stop"): Promise<boolean> {
  const seam = await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `
      (() => {
        if (typeof window.prixieShareScreen !== "function") return null;
        try {
          return Promise.resolve(window.prixieShareScreen(${JSON.stringify(action)}))
            .catch(() => "failed");
        } catch (e) { return "failed"; }
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  });
  const verdict = seam?.result?.value;
  if (verdict === "started" || verdict === "stopped") return true;
  if (verdict) return false;

  // generic web client: the share button. starting opens a picker;
  // the confirm shares the first shareable thing (the browser's own
  // view in a cloud session).
  if (action === "start") {
    const opened = await findAndClickByText(
      sessionId,
      ["share screen", "share content", "present"],
      "button, div[role='button']",
      8000,
    );
    if (!opened) return false;
    // the picker's confirm, best effort: some clients share straight
    // away with no dialog
    await findAndClickByText(sessionId, ["share", "continue", "confirm"], "button, div[role='button']", 5000);
    return true;
  }
  const stopped = await findAndClickByText(
    sessionId,
    ["stop share", "stop sharing"],
    "button, div[role='button']",
    8000,
  );
  return stopped;
}

// who is running the room (the owner, oct 21 2026): read the participant
// list WITH ROLES from the join page. the page seam is a
// window.prixieAttendees helper when the hosted page defines one
// (preferred: it knows the sdk's attendee shape), else a best-effort
// scan of the zoom sdk globals. engines that cannot tell return null:
// that is a "we do not know", never a guess.
export interface ParticipantInfo {
  name: string;
  is_host: boolean;
  is_cohost: boolean;
}

export async function getParticipantsInSession(sessionId: string): Promise<ParticipantInfo[] | null> {
  try {
    const result = await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: `
        (() => {
          const norm = (list) => (list || []).map((p) => ({
            name: String(p.name || p.displayName || p.userName || "").trim(),
            is_host: !!(p.isHost || p.is_host),
            is_cohost: !!(p.isCoHost || p.is_cohost),
          })).filter((p) => p.name);
          if (typeof window.prixieAttendees === "function") {
            return JSON.stringify(norm(window.prixieAttendees()));
          }
          if (typeof ZoomMtg !== "undefined" && ZoomMtg.getAttendeeslist) {
            try { return JSON.stringify(norm(ZoomMtg.getAttendeeslist())); } catch (e) {}
          }
          if (window.__zoomMeetingAttendees) {
            return JSON.stringify(norm(window.__zoomMeetingAttendees));
          }
          return null;
        })()
      `,
      returnByValue: true,
    });
    const raw = result?.result?.value;
    if (!raw || raw === "null") return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

// --- in-page chat monitor ---

// injects a script into the session that scans the chat DOM every few seconds and
// POSTs new messages to our own /webhooks/realtime endpoint. replaces the chat
// push events recall.ai used to send us.
export async function installChatMonitor(
  sessionId: string,
  webhookUrl: string,
  webhookSecret?: string | null,
): Promise<boolean> {
  // the realtime webhook is secret-gated (REALTIME_WEBHOOK_SECRET): the
  // injected monitor MUST carry it or every chat event gets rejected.
  // no secret configured = install anyway but warn loudly: the server
  // side will refuse the events either way, and a silent rejection is
  // worse than a visible one.
  if (!webhookSecret) {
    console.warn(
      "prixie: chat monitor installed WITHOUT a webhook secret; the realtime webhook will reject its events unless REALTIME_WEBHOOK_SECRET is unset there",
    );
  }
  const secretHeader = webhookSecret
    ? `headers: { "Content-Type": "application/json", "x-realtime-secret": ${JSON.stringify(webhookSecret)} },`
    : `headers: { "Content-Type": "application/json" },`;
  const result = await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `
      (() => {
        if (window.__prixieChatMonitor) return "already";
        window.__prixieSeenChats = new Set();
        window.__prixieChatMonitor = setInterval(() => {
          // chat bubbles live in different containers per platform. cast a wide net:
          // visible list items / short text nodes in chat-ish regions
          const candidates = document.querySelectorAll(
            '[aria-label*="chat" i] [data-message-id], ' +
            '[aria-label*="chat" i] li, ' +
            '[data-testid="chat-message"], ' +
            '[class*="chat" i] [class*="message" i], ' +
            '[class*="message" i][class*="list" i] div'
          );
          for (const el of candidates) {
            const text = (el.textContent || "").trim();
            if (!text || text.length > 2000) continue;
            if (window.__prixieSeenChats.has(text)) continue;
            window.__prixieSeenChats.add(text);
            fetch("${webhookUrl}", {
              method: "POST",
              ${secretHeader}
              body: JSON.stringify({ bot_id: "${sessionId}", kind: "chat", speaker: "participant", text }),
            }).catch(() => {});
          }
        }, 3000);
        return "installed";
      })()
    `,
    returnByValue: true,
  });

  return result?.result?.value === "installed" || result?.result?.value === "already";
}

// --- session heartbeat ---

// a no-op eval per scheduler cycle. keeps long meetings from looking idle.
export async function heartbeatSession(sessionId: string): Promise<void> {
  await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `document.title || ""`,
    returnByValue: true,
  });
}
import { dismissConsentBanners } from "./consent.ts";
import { handoffLoginToKernel } from "./kernel_auth.ts";
import { resolveAudioMode } from "./assemblyai.ts";
