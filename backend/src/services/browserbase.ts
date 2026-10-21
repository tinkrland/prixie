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
  status: "joined" | "failed" | "waiting_room";
  error?: string;
  recording_id?: string;
}

// --- session management ---

export async function createSession(options?: {
  projectId?: string;
  keepalive?: boolean;
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
      browserSettings: {
        viewport: { width: 1280, height: 800 },
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

export async function cdpExecute(sessionId: string, method: string, params: any): Promise<any> {
  const res = await fetch(`${BROWSERBASE_BASE}/sessions/${sessionId}/cdp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BROWSERBASE_API_KEY}`,
    },
    body: JSON.stringify({ method, params }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`cdp ${method} failed:`, err);
    return null;
  }

  return res.json();
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
      return { session_id: sessionId, status: "failed", error: "discord requires authentication. provide a pre-authenticated browser context." };
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

// --- mainline platforms (zoom, meet, teams) ---

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

  return { session_id: sessionId, status: "joined" };
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

  return { session_id: sessionId, status: "joined" };
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

  return { session_id: sessionId, status: "joined" };
}

// --- chat send (prixie speaking into the meeting chat) ---

export async function sendChatInSession(sessionId: string, messageText: string): Promise<boolean> {
  // open the chat panel if it is closed
  await findAndClickByText(sessionId, ["chat", "show conversation", "conversation"], "button, div[role='button']", 6000);

  // JSON.stringify produces a valid JS string literal for any payload
  const escaped = JSON.stringify(messageText);
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
            el.value = ${escaped};
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

  return result?.result?.value === "sent";
}

// --- in-page chat monitor ---

// injects a script into the session that scans the chat DOM every few seconds and
// POSTs new messages to our own /webhooks/realtime endpoint. replaces the chat
// push events recall.ai used to send us.
export async function installChatMonitor(sessionId: string, webhookUrl: string): Promise<boolean> {
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
              headers: { "Content-Type": "application/json" },
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
