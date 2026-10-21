// screenshots, decoupled from any one join engine.
//
// the capture flow should not know or care which engine rendered the
// meeting. today browserbase is the join engine; the zoom web sdk page is
// a second one arriving; a local playwright path is a plausible third.
// so the capture pipeline depends on this interface only:
//
//   ScreenshotEngine.capture(sessionRef) -> a url (or data url) of the
//   frame at the moment of capture
//
// engines register themselves by name. a meeting's platform maps to an
// engine via ENGINE_BY_PLATFORM below; unknown platforms fall back to the
// default engine (browserbase) since every platform is joined through it
// today. adding an engine is adding a file that calls registerEngine:
// the capture flow never changes.

export interface ScreenshotEngine {
  id: string;
  capture(sessionRef: string): Promise<string>; // url of the screenshot
}

const engines = new Map<string, ScreenshotEngine>();

export function registerScreenshotEngine(engine: ScreenshotEngine): void {
  engines.set(engine.id, engine);
}

export function getScreenshotEngine(id: string): ScreenshotEngine | undefined {
  return engines.get(id);
}

export function registeredEngines(): string[] {
  return [...engines.keys()];
}

// platform -> engine. browserbase joins everything today, so it is the
// default for platforms without their own renderer (meet, teams, discord,
// twitch, webex, the calendar rooms). zoom has two paths: the bot path
// rides browserbase, the web sdk path renders its own page.
const ENGINE_BY_PLATFORM: Record<string, string> = {
  zoom_websdk: "zoom-websdk-page",
};

export function engineForPlatform(platform: string): string {
  return ENGINE_BY_PLATFORM[platform] || "browserbase";
}

// the capture call the pipeline makes. it never imports an engine
// directly: the engine id decides, and a missing engine is an error with
// the id in it, not a silent skip.
export async function captureScreenshot(
  sessionRef: string,
  platform: string,
): Promise<string> {
  const engineId = engineForPlatform(platform);
  const engine = engines.get(engineId);
  if (!engine) {
    throw new Error(`no screenshot engine registered for "${engineId}"`);
  }
  return engine.capture(sessionRef);
}
