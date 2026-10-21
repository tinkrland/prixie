// engine registrations: the only file that knows a concrete renderer.
// browserbase wraps the session screenshot it already had; the zoom web
// sdk page exposes its own capture endpoint (the page can grab its own
// frame: it owns the canvas the meeting renders into).

import { takeScreenshot } from "./browserbase.ts";
import {
  registerScreenshotEngine,
  type ScreenshotEngine,
} from "./screenshots.ts";

export const browserbaseEngine: ScreenshotEngine = {
  id: "browserbase",
  capture: (sessionId: string) => takeScreenshot(sessionId),
};

export const zoomWebSdkPageEngine: ScreenshotEngine = {
  id: "zoom-websdk-page",
  // the hosted join page exposes POST /capture -> { url }. page url comes
  // from env (the same page the browserbase session loads). the engine
  // boundary stays: this is an http call to a page we host, not an import
  // of zoom's sdk into the capture pipeline.
  capture: async (_pageRef: string) => {
    const pageUrl = Deno.env.get("ZOOM_SDK_PAGE_URL");
    if (!pageUrl) {
      throw new Error("ZOOM_SDK_PAGE_URL is not set: the zoom web sdk page cannot capture");
    }
    const res = await fetch(new URL("capture", pageUrl), { method: "POST" });
    if (!res.ok) throw new Error(`zoom page capture failed: ${res.statusText}`);
    const data = await res.json();
    if (!data.url) throw new Error("zoom page capture returned no url");
    return data.url;
  },
};

// registration on import: services/index (or the capture pipeline) imports
// this file once and the engines exist.
export function registerDefaultScreenshotEngines(): void {
  registerScreenshotEngine(browserbaseEngine);
  registerScreenshotEngine(zoomWebSdkPageEngine);
}
