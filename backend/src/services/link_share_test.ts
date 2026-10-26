// link share tests: the show-and-tell without the vm. the rules that
// cannot bend, tested structurally: the canvas contract (one canvas,
// idempotent install, captureStream is the display source), an unsafe
// link is never shared, the share has an honest age cap, a second
// share on the same session is refused, and the cdp transport shapes
// (the message with the target session, the page target pick) hold.
// the live rail (capture -> paint -> publish) is io glue covered by
// the route contract, never mocked here.

import { assertEquals } from "jsr:@std/assert@1";
import {
  SHARE_CANVAS_ID,
  clickSharedLink,
  mediaConsumerJs,
  mediaProducerJs,
  videoProbeJs,
  displayMediaOverrideJs,
  navigateSharedLink,
  paintFrameJs,
  shareCanvasSize,
  shareExpired,
  shareFrameIntervalMs,
  shareLinkInSession,
  stopLinkShare,
} from "./link_share.ts";
import { buildCdpMessage, pickPageTarget } from "./browserbase.ts";

Deno.test("the override installs once, display source is the media lane or the canvas", () => {
  const js = displayMediaOverrideJs();
  // idempotent: a second install is a no-op, not a stack
  assertEquals(js.includes("__prixieLinkShareActive"), true);
  assertEquals(js.includes(`"already"`), true);
  // the remote webrtc stream wins when the media lane is up, the
  // canvas is the frames lane fallback, never a picker
  assertEquals(
    js.includes("getDisplayMedia = async () =>\n        window.__prixieShareStream || canvas.captureStream(10)"),
    true,
  );
  assertEquals(js.includes(SHARE_CANVAS_ID), true);
  assertEquals(js.includes(`canvas.width = ${shareCanvasSize().width}`), true);
});

Deno.test("the media lane: the page's video is captured natively, audio is a toggle", () => {
  const producer = mediaProducerJs(true);
  // the video element's own stream, real time, not screenshots
  assertEquals(producer.includes("v.captureStream()"), true);
  assertEquals(producer.includes("stream.getAudioTracks().forEach"), true);
  const silent = mediaProducerJs(false);
  assertEquals(silent.includes("getAudioTracks"), false);
  // localhost only: no external stun, ice gathers fully pre-offer
  assertEquals(producer.includes("iceServers: []"), true);
  assertEquals(producer.includes("iceGatheringState"), true);
  const consumer = mediaConsumerJs(true);
  assertEquals(consumer.includes("getAudioTracks())"), true);
  assertEquals(consumer.includes("__prixieShareStreamReady = true"), true);
  const silentConsumer = mediaConsumerJs(false);
  assertEquals(silentConsumer.includes("getAudioTracks"), false);
});

Deno.test("the probe decides the lane and never guesses", () => {
  const js = videoProbeJs();
  assertEquals(js.includes("readyState >= 2"), true);
  assertEquals(js.includes("JSON.stringify({ found: false })"), true);
});

Deno.test("paint frames land on the canvas, data url and all", () => {
  const js = paintFrameJs("data:image/jpeg;base64,QUJD");
  assertEquals(js.includes("data:image/jpeg;base64,QUJD"), true);
  assertEquals(js.includes("drawImage(img, 0, 0, 1280, 720)"), true);
  assertEquals(js.includes(SHARE_CANVAS_ID), true);
});

Deno.test("an unsafe link is never shared, the reason travels", async () => {
  const r = await shareLinkInSession("fake-session", "https://bad.example", true, async () => ({
    safe: false,
    reason: "phishy",
  }));
  assertEquals(r.ok, false);
  assertEquals(r.reason, "link refused: phishy");
});

Deno.test("a link share without a url or without a session is refused", async () => {
  const noUrl = await shareLinkInSession("fake-session", "", true, async () => ({ safe: true }));
  assertEquals(noUrl.ok, false);
  const noShare = await stopLinkShare("unknown-session");
  assertEquals(noShare.ok, false);
  assertEquals(noShare.reason, "no link share is running for this session");
  const nav = await navigateSharedLink("unknown-session", "https://ok.example");
  assertEquals(nav.ok, false);
  const click = await clickSharedLink("unknown-session", "#nav");
  assertEquals(click.ok, false);
});

Deno.test("the honest age cap: a share older than the max minutes is expired", () => {
  const started = Date.now();
  assertEquals(shareExpired(started, started + 60_000, 20), false);
  assertEquals(shareExpired(started, started + 21 * 60_000, 20), true);
});

Deno.test("the frame pace has a sane floor and the canvas is 720p", () => {
  assertEquals(shareCanvasSize(), { width: 1280, height: 720 });
  assertEquals(shareFrameIntervalMs() >= 500, true);
});

Deno.test("the cdp transport message carries the target session, browser-level does not", () => {
  const page = buildCdpMessage(1, "Runtime.evaluate", { expression: "1" }, "tsid-123");
  assertEquals(page.sessionId, "tsid-123");
  const browser = buildCdpMessage(1, "Target.getTargets", {});
  assertEquals("sessionId" in browser, false);
  assertEquals(browser.id, 1);
  assertEquals(browser.method, "Target.getTargets");
});

Deno.test("the page target is picked from the target list, never a guess", () => {
  const infos = [
    { type: "iframe", targetId: "t1" },
    { type: "page", targetId: "t2" },
    { type: "worker", targetId: "t3" },
  ];
  assertEquals(pickPageTarget(infos)?.targetId, "t2");
  assertEquals(pickPageTarget([]), null);
  assertEquals(pickPageTarget(undefined as any), null);
});
