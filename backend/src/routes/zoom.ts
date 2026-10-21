// the zoom web sdk signature endpoint. the hosted join page (website/)
// calls this to sign its join: the sdk secret never leaves the backend.
//
// ZOOM_SDK_KEY + ZOOM_SDK_SECRET (a zoom "meeting sdk" app in the
// marketplace) must be set; without them the endpoint 503s honestly.

import { Hono } from "hono";
import { generateSdkSignature, parseZoomJoinUrl } from "../services/zoom_web_sdk.ts";

const zoomRouter = new Hono();

zoomRouter.post("/signature", async (c) => {
  const sdkKey = Deno.env.get("ZOOM_SDK_KEY");
  const sdkSecret = Deno.env.get("ZOOM_SDK_SECRET");
  if (!sdkKey || !sdkSecret) {
    return c.json(
      { error: "zoom sdk not configured: set ZOOM_SDK_KEY + ZOOM_SDK_SECRET" },
      503,
    );
  }

  const body = await c.req.json().catch(() => null);
  if (!body?.meetingNumber) {
    return c.json({ error: "meetingNumber is required" }, 400);
  }

  const signature = await generateSdkSignature(
    String(body.meetingNumber),
    body.role === 1 ? 1 : 0, // she joins as a participant. role 1 is not ours to give.
    sdkKey,
    sdkSecret,
  );

  return c.json({ signature, sdkKey });
});

// convenience: parse a join url into meeting number + passcode, so the
// page can fetch both in one hop.
zoomRouter.post("/parse", (c) =>
  c.req.json().then((body) => {
    if (!body?.joinUrl) return c.json({ error: "joinUrl is required" }, 400);
    return c.json(parseZoomJoinUrl(String(body.joinUrl)));
  }));

export { zoomRouter };
