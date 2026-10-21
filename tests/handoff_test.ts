// handoff contract tests. run: deno test tests/handoff_test.ts
// everything is mocked at the fetch boundary: no masky credits, no retelldb
// server needed. the point is the contract: one render feeds both livekit
// tracks, the profile drives delivery, draft is the default.

// env before import: the modules read these at load time.
Deno.env.set("MASKY_API_KEY", "mky_test");
Deno.env.set("RETELLDB_URL", "http://retelldb.test");
Deno.env.set("RETELLDB_API_KEY", "retell_test");

const calls: { url: string; method: string; body?: any }[] = [];

function json(url: string, method: string, body: unknown, respond: unknown) {
  return { url, method, body, respond };
}

const maskyAvatars = [{
  avatarId: "av1",
  avatarOwnerUserId: "owner1",
  displayName: "prixie",
  avatarImageUrl: "https://img/prixie.png",
  personalityPrompt: null,
  voiceId: "voice_1",
  publiclyRenderable: false,
}];

let profile: unknown = {
  persona_id: "prixie",
  lingvica: {
    register_by_medium: { "call": "casual, warm" },
    tone_defaults: { warmth: 0.8, sarcasm_level: 0.1, playfulness: 0.8, confidence: 0.6 },
  },
};

function route(url: string, method: string, body: unknown): unknown {
  if (url === "http://retelldb.test/v1/profile/prixie") return profile;
  if (url === "http://retelldb.test/v1/query") return { results: [] };
  if (url === "https://masky.ai/api/avatars" && method === "GET") {
    return { avatars: maskyAvatars };
  }
  if (url === "https://masky.ai/api/conversations" && method === "POST") {
    return {
      conversationId: "conv1",
      shareSlug: "c-test",
      liveUrl: "https://masky.ai/live/c-test?token=t",
    };
  }
  if (url === "https://masky.ai/api/conversations/conv1/silent-renders" && method === "POST") {
    return { status: "rendering" };
  }
  if (url === "https://masky.ai/api/conversations/conv1/turn" && method === "POST") {
    return {
      turn: {
        id: "turn1", role: "avatar", status: "pending", output: "video",
        avatarText: null, audioUrl: null, videoUrl: null, shareSlug: null,
        errorMessage: null,
      },
      async: true,
    };
  }
  if (url === "https://masky.ai/api/conversations/by-slug/c-test" && method === "GET") {
    return {
      conversationId: "conv1",
      turns: [{
        id: "turn1", role: "avatar", status: "video", output: "video",
        avatarText: "hello there", audioUrl: "https://a/audio.mp3",
        videoUrl: "https://v/video.mp4", shareSlug: "t-test",
        liveUrl: "https://masky.ai/live/t-test", errorMessage: null,
        fromSpeakCache: false,
      }],
    };
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const realFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  calls.push({ url, method, body });
  return Promise.resolve(
    new Response(JSON.stringify(route(url, method, body)), { status: 200 }),
  );
}) as typeof fetch;

const { PersonaVoice, voiceStyleFromProfile, runCall } = await import(
  "../server/handoff.ts"
);
const { speak } = await import("../server/masky.ts");

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test("init wires face, idle loop and profile together", async () => {
  const voice = await PersonaVoice.init({
    personaRef: "prixie",
    facePrompt: "unused",
    voiceId: "voice_1",
  });
  assert(voice.avatar.avatarId === "av1", "reuses the existing persona avatar");
  assert(voice.profile != null, "loads the voice profile from retelldb");
  const idle = calls.find((c) => c.url.includes("silent-renders"));
  assert(idle != null, "idle loop enabled at init");
  assert(idle?.body?.enabled === true, "idle loop enabled=true");
});

Deno.test("say renders one utterance into both tracks", async () => {
  const voice = await PersonaVoice.init({
    personaRef: "prixie",
    facePrompt: "unused",
    voiceId: "voice_1",
  });
  const render = await voice.say({ text: "hey team, quick update." });

  const turnCall = calls.find((c) => c.url.endsWith("/turn") && c.method === "POST");
  assert(turnCall != null, "speak turn posted");
  const b: any = turnCall!.body;
  assert(b.mode === "speak", "verbatim speak mode");
  assert(b.output === "video", "video output");
  assert(b.draft === true, "draft is the default render tier");
  assert(b.quality === undefined, "no quality enum sent with draft");
  assert(
    (b.voiceStyle as Record<string, unknown>)?.emotion === "enthusiasm",
    "profile playfulness 0.8 maps to enthusiasm",
  );
  assert(
    Array.isArray(b.voiceStyle?.prosody) && (b.voiceStyle?.prosody as string[]).includes("expressive_high"),
    "playful tone maps to expressive_high",
  );

  // the contract: same render, both tracks.
  assert(render.audioUrl === "https://a/audio.mp3", "audio track from the same turn");
  assert(render.videoUrl === "https://v/video.mp4", "video track from the same turn");
  assert(render.turnLiveUrl === "https://masky.ai/live/t-test", "turn live url minted");
});

Deno.test("runCall publishes the same render to the room, then idles", async () => {
  const voice = await PersonaVoice.init({
    personaRef: "prixie",
    facePrompt: "unused",
    voiceId: "voice_1",
  });

  const published: { audioUrl: string; videoUrl: string }[] = [];
  let idleCalls = 0;
  let hearCalls = 0;

  await runCall(
    voice,
    {
      publish: async (tracks) => { published.push(tracks); },
      idle: async () => { idleCalls++; },
    },
    async () => (hearCalls++ === 0 ? { text: "one line only." } : null),
  );

  assert(published.length === 1, "one utterance published");
  assert(published[0].audioUrl === "https://a/audio.mp3", "room hears the render");
  assert(published[0].videoUrl === "https://v/video.mp4", "room sees the same render");
  assert(idleCalls === 1, "publisher idles when there is nothing to say");
});

Deno.test("voice style mapping covers the rest of the tone space", () => {
  const sarcastic = voiceStyleFromProfile({
    persona_id: "x",
    lingvica: { tone_defaults: { warmth: 0.3, sarcasm_level: 0.8, playfulness: 0.5, confidence: 0.6 } },
  });
  assert(sarcastic.emotion === "amusement", "sarcasm maps to amusement");

  const shy = voiceStyleFromProfile({
    persona_id: "x",
    lingvica: { tone_defaults: { warmth: 0.5, sarcasm_level: 0, playfulness: 0.4, confidence: 0.2 } },
  });
  assert(
    (shy.prosody ?? []).includes("speed_slow") && (shy.prosody ?? []).includes("expressive_low"),
    "low confidence maps to slow, flat delivery",
  );

  const hushed = voiceStyleFromProfile({
    persona_id: "x",
    lingvica: {
      register_by_medium: { "call": "whispered, side conversations" },
      tone_defaults: { warmth: 0.5, sarcasm_level: 0, playfulness: 0.5, confidence: 0.5 },
    },
  });
  assert(hushed.style === "whispering", "whisper register maps to whispering style");

  assert(voiceStyleFromProfile(null).emotion === undefined, "no profile, no cues");
});

Deno.test("speak enforces the 500 char turn limit", async () => {
  // fetch stays mocked for the whole run; it is restored here, last of all.
  let caught = false;
  try {
    await speak({ conversationId: "conv1", shareSlug: "c-test", liveUrl: "l", isPublic: false }, "x".repeat(501));
  } catch (e) {
    caught = e instanceof Error && e.message.includes("500");
  }
  assert(caught, "over-long utterance rejected before any api call");
  globalThis.fetch = realFetch;
});
