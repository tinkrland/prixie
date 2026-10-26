// link share: the show-and-tell without the vm (the owner, oct 26 2026).
// she does not share a screen in general, and the standing vm is
// parked. but a deployed thing (a pitch deck, a live site, a page
// playing a video) she CAN show: the url opens as a second tab in
// the SAME browserbase session as the meeting tab, and the meeting
// tab shares one of two lanes:
//
//   frames lane (decks, docs, nav): pixel-true cdp captures of the
//   share tab (Page.captureScreenshot, jpeg) painted onto the share
//   canvas. demo pace (a frame every couple of seconds), honest for
//   static pages and page turns.
//
//   media lane (the owner's case: a video the page plays): the share
//   tab's own <video> element captured natively (captureStream, real
//   time, 30fps), piped tab-to-tab over a localhost webrtc
//   connection (same browser, no external stun, no trickle: ice
//   gathers fully before the handshake), audio tracks included or
//   omitted by a toggle (audio: true by default). zoom's share
//   request gets the remote stream, so the meeting hears what the
//   page plays, like a person sharing a tab with sound on.
//
// the lane is chosen at start: the share tab is probed for a
// playing video; one is found = media lane, else frames lane.
// switching lanes mid-share means stop and start again (zoom asks
// for a display source once). the honest limits: netflix-style drm
// media will not captureStream (the browser refuses, the frames
// lane catches the page instead), autoplay-blocked videos are probed
// for ~4 seconds then treated as no video, and she does not share a
// screen generally: this fires only at a show-and-tell moment, like
// the screenshare switch beside it. localhost / undeployed things
// stay the parked microvm's job.
//
// the stream seam: before zoom asks for a display source, the
// meeting tab's navigator.mediaDevices.getDisplayMedia is pointed at
// the share canvas (canvas.captureStream), or the remote webrtc
// stream when the media lane is up. the cloud browser never opens a
// picker it cannot answer.

import {
  cdpExecute,
  cdpExecuteInTarget,
  createTabInSession,
  closeTabInSession,
  keyPressInTarget,
  listTabsInSession,
  setScreenshareInSession,
  unmuteAndSpeakInSession,
} from "./browserbase.ts";
import { assertLinkSafe } from "./link_safety.ts";

// --- the share canvas contract (the meeting tab side) ---

export const SHARE_CANVAS_ID = "prixie-link-share-canvas";

export function shareCanvasSize(): { width: number; height: number } {
  return { width: 1280, height: 720 };
}

export function shareFrameIntervalMs(): number {
  return Number(Deno.env.get("PRIXIE_SHARE_FRAME_MS")) || 2000;
}

export function shareMaxMinutes(): number {
  return Number(Deno.env.get("PRIXIE_SHARE_MAX_MINUTES")) || 20;
}

export function shareExpired(startedAt: number, now: number, maxMinutes: number): boolean {
  return now - startedAt > maxMinutes * 60_000;
}

export type ShareLane = "frames" | "media";

// the getDisplayMedia override, installed in the meeting tab. the
// media lane's remote stream wins when it is ready, else the canvas.
// the idempotent guard keeps a re-install from stacking overrides.
export function displayMediaOverrideJs(): string {
  const { width, height } = shareCanvasSize();
  return `
    (() => {
      if (window.__prixieLinkShareActive) return "already";
      let canvas = document.getElementById(${JSON.stringify(SHARE_CANVAS_ID)});
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.id = ${JSON.stringify(SHARE_CANVAS_ID)};
        canvas.width = ${width};
        canvas.height = ${height};
        canvas.style.cssText = "position:fixed;left:-9999px;top:0;";
        document.body.appendChild(canvas);
      }
      window.__prixieLinkShareCanvas = canvas;
      navigator.mediaDevices.getDisplayMedia = async () =>
        window.__prixieShareStream || canvas.captureStream(10);
      window.__prixieLinkShareActive = true;
      return "installed";
    })()
  `;
}

// paint one frame (a jpeg data url from the share tab) onto the
// canvas. async by nature (image load); the caller does not await it.
export function paintFrameJs(dataUrl: string): string {
  const { width, height } = shareCanvasSize();
  return `
    (() => {
      let canvas = document.getElementById(${JSON.stringify(SHARE_CANVAS_ID)});
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.id = ${JSON.stringify(SHARE_CANVAS_ID)};
        canvas.width = ${width};
        canvas.height = ${height};
        canvas.style.cssText = "position:fixed;left:-9999px;top:0;";
        document.body.appendChild(canvas);
        window.__prixieLinkShareCanvas = canvas;
      }
      const img = new Image();
      img.onload = () => {
        canvas.width = ${width};
        canvas.height = ${height};
        canvas.getContext("2d").drawImage(img, 0, 0, ${width}, ${height});
      };
      img.src = ${JSON.stringify(dataUrl)};
      return "painted";
    })()
  `;
}

// --- presenter mode (slides: notes she reads, the room never sees) ---
//
// a deck is not a page: the point of presenting one is the split —
// the audience view (what the share tab shows: /present, full-screen
// slides, nothing else) and the presenter view (the popup with the
// speaker notes, the timer, the slide counter: hers, never shared).
// google slides opens that popup with the s key on the presenting
// tab (verified live oct 26 against a public deck: the popup is a
// new tab target, the notes land in
// .punch-viewer-speakernotes-text-body, and arrow keys on the
// audience tab advance both views together). so: the share tab opens
// the deck's /present url, the s keypress opens the notes tab, and
// she can read the notes and speak them while the room sees only
// the slides. published /e/ decks have no present view at all
// (verified: no controls, no popup) — those stay frames-only, no
// notes, honestly.

export type DeckKind = "google-slides";

export function detectDeckKind(url: string): DeckKind | null {
  // docs.google.com/presentation/d/{id}... (edit or share link).
  // /presentation/d/e/... is published-to-web: no present mode (the
  // negative lookahead keeps /d/e/2PACX-... out, verified live).
  const m = url?.match(/^https:\/\/docs\.google\.com\/presentation\/d\/(?!e\/)([a-zA-Z0-9_-]+)/);
  return m ? "google-slides" : null;
}

export function googleSlidesPresentUrl(url: string): string {
  const m = url?.match(/^https:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  return m ? `https://docs.google.com/presentation/d/${m[1]}/present` : url;
}

// the notes text of the current slide, read from the presenter view.
// the class is google's own (live-verified); the aria-label is the
// fallback; an honest empty string when neither is there.
export function readSlideNotesJs(): string {
  return `
    (() => {
      const el = document.querySelector(".punch-viewer-speakernotes-text-body")
        || document.querySelector('[aria-label*="Speaker Notes" i]');
      const text = el ? el.innerText : "";
      return JSON.stringify({ notes: (text || "").trim() });
    })()
  `;
}

export function readSlideCounterJs(): string {
  return `
    (() => {
      const m = document.body.innerText.match(/Slide (\d+) of (\d+)/);
      return JSON.stringify(m ? { slide: Number(m[1]), of: Number(m[2]) } : { slide: null, of: null });
    })()
  `;
}

// --- narration: the voice rail while presenting ---
//
// she speaks while she presents: the notes are the deck's own words
// (what the presenter wrote to be said), persona memory (retelldb)
// is what she knows beyond the deck. the composition is honest:
// notes verbatim when they exist, persona memory as the floor when
// a slide has none, silence when she knows nothing about it. the
// voice itself rides the existing speak seam (obs mode: her real
// voice through the virtual mic; else the page's synthesis) on the
// MEETING tab — presenting never touches that tab, so nothing here
// can take her voice away.

export interface PersonaMemory {
  key: string | null;
  value: string | null;
}
export type PersonaContext = (query: string) => Promise<PersonaMemory[]>;

// retelldb via memorium (the persona memory system on main). the
// perspective comes from the environment; without it the context is
// honestly empty, never invented.
export async function defaultPersonaContext(query: string): Promise<PersonaMemory[]> {
  const q = (query || "").trim();
  if (!q) return [];
  const perspectiveId = Deno.env.get("PRIXIE_PERSPECTIVE_ID");
  if (!perspectiveId) return [];
  try {
    const { retrieve } = await import("./memorium.ts");
    const results = await retrieve({ perspectiveId, query: q, limit: 3 });
    return (results || []).map((r: any) => ({ key: r?.memory?.key ?? null, value: r?.memory?.value ?? null }));
  } catch {
    return [];
  }
}

export function composeNarration(notes: string, memories: PersonaMemory[]): string {
  const spoken = (notes || "").replace(/\s+/g, " ").trim();
  if (spoken) return spoken;
  // blank slide notes: what she knows is the floor, never a guess
  const known = (memories || []).map((m) => (m.value || m.key || "").trim()).filter(Boolean);
  return known.length ? `from what i know: ${known[0]}` : "";
}

// --- the media lane (share tab side): the page's own video ---

// does the page have a playing (or loadable) video? decides the lane.
export function videoProbeJs(): string {
  return `
    (() => {
      const vids = [...document.querySelectorAll("video")];
      const ready = vids.filter((v) => v.readyState >= 2);
      const playing = ready.find((v) => !v.paused) || ready[0];
      if (!playing) return JSON.stringify({ found: false });
      let hasAudio = false;
      try { hasAudio = playing.captureStream().getAudioTracks().length > 0; } catch (e) {}
      return JSON.stringify({ found: true, hasAudio });
    })()
  `;
}

// the producer: capture the video element natively, offer it over
// webrtc. ice gathers fully before the offer leaves (no trickle:
// both tabs are one browser, host candidates, localhost).
export function mediaProducerJs(includeAudio: boolean): string {
  return `
    (() => {
      window.__prixieShareProduce = async () => {
        const vids = [...document.querySelectorAll("video")].filter((v) => v.readyState >= 2);
        const v = vids.find((x) => !x.paused) || vids[0];
        if (!v) return JSON.stringify({ error: "no video" });
        const stream = v.captureStream ? v.captureStream() : null;
        if (!stream) return JSON.stringify({ error: "no capture" });
        const pc = new RTCPeerConnection({ iceServers: [] });
        stream.getVideoTracks().forEach((t) => pc.addTrack(t, stream));
        ${includeAudio ? 'stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));' : ""}
        window.__prixieSharePc = pc;
        await pc.setLocalDescription(await pc.createOffer());
        if (pc.iceGatheringState !== "complete") {
          await new Promise((done) => {
            pc.addEventListener("icegatheringstatechange", () => {
              if (pc.iceGatheringState === "complete") done(null);
            });
          });
        }
        window.__prixieShareOffer = JSON.stringify({ sdp: pc.localDescription });
        return "produced";
      };
      return "installed";
    })()
  `;
}

// call the producer (after install): returns when the offer is ready
export function producerCallJs(): string {
  return `(window.__prixieShareProduce ? window.__prixieShareProduce() : Promise.resolve("missing"))`;
}

export function producerOfferPollJs(): string {
  return `(() => window.__prixieShareOffer || null)()`;
}

// the consumer (meeting tab side): take the offer, answer it, and
// expose the remote stream the getDisplayMedia override returns.
export function mediaConsumerJs(includeAudio: boolean): string {
  return `
    (() => {
      window.__prixieShareConsume = (offerJson) => {
        const { sdp } = JSON.parse(offerJson);
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.ontrack = (e) => {
          const tracks = [...e.streams[0].getVideoTracks()];
          ${includeAudio ? 'tracks.push(...e.streams[0].getAudioTracks());' : ""}
          window.__prixieShareStream = new MediaStream(tracks);
          window.__prixieShareStreamReady = true;
        };
        window.__prixieShareZoomPc = pc;
        return pc.setRemoteDescription(sdp)
          .then(() => pc.createAnswer())
          .then((answer) => pc.setLocalDescription(answer))
          .then(() => {
            return new Promise((done) => {
              if (pc.iceGatheringState === "complete") done(null);
              else pc.addEventListener("icegatheringstatechange", () => {
                if (pc.iceGatheringState === "complete") done(null);
              });
            });
          })
          .then(() => JSON.stringify({ sdp: pc.localDescription }));
      };
      return "ready";
    })()
  `;
}

// share tab: accept the answer to finish the producer's handshake
export function producerAcceptJs(answerJson: string): string {
  return `
    (() => {
      if (!window.__prixieSharePc) return "no pc";
      window.__prixieSharePc.setRemoteDescription(${JSON.stringify(JSON.parse(answerJson).sdp)});
      return "accepted";
    })()
  `;
}

// click inside the share tab (a nav bar link, a deck's next button)
export function clickSharedLinkJs(selector?: string, text?: string): string {
  const find = selector
    ? `document.querySelector(${JSON.stringify(selector)})`
    : `[...document.querySelectorAll("a, button, div[role='button']")].find((el) => el.innerText.trim().toLowerCase().includes(${JSON.stringify((text || "").toLowerCase())}))`;
  return `
    (() => {
      const el = ${find};
      if (!el) return "not found";
      el.click();
      return "clicked";
    })()
  `;
}

// --- the share state (one share per meeting session) ---

interface LinkShareState {
  targetId: string;
  lane: ShareLane;
  timer: ReturnType<typeof setInterval>;
  startedAt: number;
  url: string;
  deckKind: DeckKind | null;
  presenterTargetId?: string; // the notes tab (never shared)
}

const linkShares = new Map<string, LinkShareState>();

export interface LinkShareResult {
  ok: boolean;
  reason?: string;
  lane?: ShareLane;
  presenter?: boolean;
}

// start: open the url in a share tab, pick the lane, point the
// meeting tab's display media at it, start the share, then keep the
// frames lane painted until the share stops (or its honest cap).
export async function shareLinkInSession(
  sessionId: string,
  url: string,
  audio = true,
  safety: (u: string) => Promise<{ safe: boolean; reason?: string }> = assertLinkSafe,
): Promise<LinkShareResult> {
  if (linkShares.has(sessionId)) {
    return { ok: false, reason: "a link share is already running for this session (stop it first)" };
  }
  if (!url || typeof url !== "string") {
    return { ok: false, reason: "no url to share" };
  }
  // she presents what she vetted: an unsafe link is refused, not shown
  const verdict = await safety(url);
  if (!verdict?.safe) {
    return { ok: false, reason: verdict?.reason ? `link refused: ${verdict.reason}` : "link refused (unsafe)" };
  }

  // a deck presents its audience view, not its edit page
  const deckKind = detectDeckKind(url);
  const audienceUrl = deckKind === "google-slides" ? googleSlidesPresentUrl(url) : url;
  const targetId = await createTabInSession(sessionId, audienceUrl);
  if (!targetId) {
    return { ok: false, reason: "the share tab could not be opened" };
  }

  // presenter mode: the s keypress on the presenting tab opens the
  // notes popup; we find it by diffing the tab list around the press
  let presenterTargetId: string | undefined;
  if (deckKind === "google-slides") {
    await new Promise((r) => setTimeout(r, 5000)); // let the deck load
    const before = await listTabsInSession(sessionId);
    await keyPressInTarget(sessionId, targetId, "s", "KeyS", 83);
    await new Promise((r) => setTimeout(r, 4000));
    const after = await listTabsInSession(sessionId);
    const knownIds = new Set(before.map((t: any) => t.targetId).concat([targetId]));
    const popup = after.find((t: any) => !knownIds.has(t.targetId));
    presenterTargetId = popup?.targetId;
    // honest: without the notes tab she can still present, she just
    // cannot read the deck's notes
  }

  // lane pick: probe for a playing video for a few seconds
  let lane: ShareLane = "frames";
  const probeDeadline = Date.now() + 4000;
  while (Date.now() < probeDeadline) {
    const probe = await cdpExecuteInTarget(sessionId, targetId, "Runtime.evaluate", {
      expression: videoProbeJs(),
      returnByValue: true,
    });
    const found = probe?.result?.result?.value;
    if (found && JSON.parse(found)?.found) {
      lane = "media";
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // the meeting tab: the display media override, then the share itself
  await cdpExecute(sessionId, "Runtime.evaluate", {
    expression: displayMediaOverrideJs(),
    returnByValue: true,
  });

  if (lane === "media") {
    // webrtc the page's video to the meeting tab, THEN start the
    // share so zoom's single getDisplayMedia call gets the remote
    // stream, not the canvas
    await cdpExecuteInTarget(sessionId, targetId, "Runtime.evaluate", {
      expression: mediaProducerJs(audio),
      returnByValue: true,
    });
    await cdpExecuteInTarget(sessionId, targetId, "Runtime.evaluate", {
      expression: producerCallJs(),
      awaitPromise: true,
      returnByValue: true,
    });
    await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: mediaConsumerJs(audio),
      returnByValue: true,
    });
    const offer = await cdpExecuteInTarget(sessionId, targetId, "Runtime.evaluate", {
      expression: producerOfferPollJs(),
      returnByValue: true,
    });
    const offerJson = offer?.result?.result?.value;
    if (offerJson) {
      const answer = await cdpExecute(sessionId, "Runtime.evaluate", {
        expression: `(window.__prixieShareConsume(${JSON.stringify(offerJson)}))`,
        awaitPromise: true,
        returnByValue: true,
      });
      const answerJson = answer?.result?.result?.value;
      if (answerJson) {
        await cdpExecuteInTarget(sessionId, targetId, "Runtime.evaluate", {
          expression: producerAcceptJs(answerJson),
          returnByValue: true,
        });
        // wait for the remote stream to exist before zoom asks
        const readyDeadline = Date.now() + 5000;
        while (Date.now() < readyDeadline) {
          const ready = await cdpExecute(sessionId, "Runtime.evaluate", {
            expression: `(() => !!window.__prixieShareStreamReady)()`,
            returnByValue: true,
          });
          if (ready?.result?.result?.value) break;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }
  }

  const started = await setScreenshareInSession(sessionId, "start");
  if (!started) {
    await closeTabInSession(sessionId, targetId);
    return { ok: false, reason: "the share could not be started (no sdk seam and no share button found)" };
  }

  // the frames lane keeps painting; the media lane needs no loop
  // beyond the honest age cap
  const timer = setInterval(async () => {
    const state = linkShares.get(sessionId);
    if (!state || shareExpired(state.startedAt, Date.now(), shareMaxMinutes())) {
      if (state) await stopLinkShare(sessionId);
      return;
    }
    if (state.lane !== "frames") return;
    try {
      const shot = await cdpExecuteInTarget(sessionId, state.targetId, "Page.captureScreenshot", {
        format: "jpeg",
        quality: 70,
      });
      const frame = shot?.result?.data;
      if (!frame) return;
      await cdpExecute(sessionId, "Runtime.evaluate", {
        expression: paintFrameJs(`data:image/jpeg;base64,${frame}`),
        returnByValue: true,
      });
    } catch {
      // a dropped frame never kills the share: the next tick retries
    }
  }, shareFrameIntervalMs());

  linkShares.set(sessionId, {
    targetId,
    lane,
    timer,
    startedAt: Date.now(),
    url,
    deckKind,
    ...(presenterTargetId ? { presenterTargetId } : {}),
  });
  return { ok: true, lane, ...(deckKind ? { presenter: !!presenterTargetId } : {}) };
}

// stop: end the share, stop the paint loop, close the share tab.
export async function stopLinkShare(sessionId: string): Promise<LinkShareResult> {
  const state = linkShares.get(sessionId);
  if (!state) return { ok: false, reason: "no link share is running for this session" };
  clearInterval(state.timer);
  linkShares.delete(sessionId);
  await setScreenshareInSession(sessionId, "stop");
  await closeTabInSession(sessionId, state.targetId);
  if (state.presenterTargetId) await closeTabInSession(sessionId, state.presenterTargetId);
  return { ok: true, reason: "stopped" };
}

// navigate the shared page: prixie walks the site's own links, the
// frames follow. every hop is vetted like the first.
export async function navigateSharedLink(
  sessionId: string,
  url: string,
  safety: (u: string) => Promise<{ safe: boolean; reason?: string }> = assertLinkSafe,
): Promise<LinkShareResult> {
  const state = linkShares.get(sessionId);
  if (!state) return { ok: false, reason: "no link share is running for this session" };
  const verdict = await safety(url);
  if (!verdict?.safe) {
    return { ok: false, reason: verdict?.reason ? `link refused: ${verdict.reason}` : "link refused (unsafe)" };
  }
  await cdpExecuteInTarget(sessionId, state.targetId, "Page.navigate", { url });
  return { ok: true };
}

// click inside the shared page (a nav bar link, a deck's next
// button): the real page, the real click.
export async function clickSharedLink(
  sessionId: string,
  selector?: string,
  text?: string,
): Promise<LinkShareResult> {
  const state = linkShares.get(sessionId);
  if (!state) return { ok: false, reason: "no link share is running for this session" };
  if (!selector && !text) return { ok: false, reason: "click needs a selector or text" };
  const r = await cdpExecuteInTarget(sessionId, state.targetId, "Runtime.evaluate", {
    expression: clickSharedLinkJs(selector, text),
    returnByValue: true,
  });
  if (r?.result?.result?.value !== "clicked") {
    return { ok: false, reason: "the element was not found on the shared page" };
  }
  return { ok: true };
}

// narrate the current slide: read the notes (presenter view), floor
// with persona memory when the slide is bare, and speak on the
// meeting tab. presenting never touches that tab, so the voice rail
// is intact while she shows.
export async function narrateSlide(
  sessionId: string,
  persona: PersonaContext = defaultPersonaContext,
): Promise<LinkShareResult> {
  const state = linkShares.get(sessionId);
  if (!state) return { ok: false, reason: "no link share is running for this session" };
  if (!state.presenterTargetId) {
    return { ok: false, reason: "no presenter view for this share (not a deck, or the popup did not open)" };
  }
  const read = await cdpExecuteInTarget(sessionId, state.presenterTargetId, "Runtime.evaluate", {
    expression: readSlideNotesJs(),
    returnByValue: true,
  });
  let notes = "";
  try {
    notes = JSON.parse(read?.result?.result?.value || "{}")?.notes || "";
  } catch { /* notes stay empty, the persona floor decides */ }
  const memories = notes ? [] : await persona(state.url);
  const narration = composeNarration(notes, memories);
  if (!narration) return { ok: false, reason: "nothing to narrate for this slide" };
  const spoken = await unmuteAndSpeakInSession(sessionId, narration);
  return spoken
    ? { ok: true, reason: "narrating" }
    : { ok: false, reason: "the voice seam could not speak (no unmute helper or mic button on the join page)" };
}

// advance the deck one step: arrow keys on the audience tab drive
// both views (verified live: the presenter view follows).
export async function advanceSlide(sessionId: string): Promise<LinkShareResult> {
  const state = linkShares.get(sessionId);
  if (!state) return { ok: false, reason: "no link share is running for this session" };
  if (!state.deckKind) return { ok: false, reason: "not a deck: nothing to advance" };
  const ok = await keyPressInTarget(sessionId, state.targetId, "ArrowRight", "ArrowRight", 39);
  if (!ok) return { ok: false, reason: "the slide could not be advanced" };
  let counter: string | null = null;
  if (state.presenterTargetId) {
    const read = await cdpExecuteInTarget(sessionId, state.presenterTargetId, "Runtime.evaluate", {
      expression: readSlideCounterJs(),
      returnByValue: true,
    });
    try {
      const c = JSON.parse(read?.result?.result?.value || "{}");
      if (c?.slide) counter = `${c.slide} of ${c.of}`;
    } catch { /* the counter is a nicety, not a gate */ }
  }
  return { ok: true, ...(counter ? { reason: `now on slide ${counter}` } : {}) };
}
