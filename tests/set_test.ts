// the set: light recipes render twice, and the room gets pinned once.
// run: deno test --allow-env --allow-net tests/set_test.ts

Deno.env.set("MASKY_API_KEY", "mky_test");

const calls: { url: string; method: string; body?: any }[] = [];

globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  calls.push({ url, method, body });
  if (url.endsWith("/images") && method === "POST") {
    return Promise.resolve(
      new Response(JSON.stringify({ avatarId: "av1", assetId: "as9", url: "https://masky/avatars/av1/as9.png" }), { status: 200 }),
    );
  }
  if (url.includes("/avatar-image") && method === "POST") {
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }
  return Promise.resolve(new Response(JSON.stringify({ error: "unexpected " + url }), { status: 400 }));
}) as typeof fetch;

const {
  LIGHT_RECIPES,
  backdropPrompt,
  defaultSet,
  lightingPrompt,
  pinSet,
  scenePrompt,
  shotPrompt,
} = await import("../server/set.ts");

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test("the light table mirrors proskena's rig", () => {
  // values copied from proskena lighting/41-lighting.js: if the mirror drifts,
  // the two renderers drift, which is the one thing this module exists to
  // prevent.
  const soft = LIGHT_RECIPES.soft_studio;
  assert(soft.key.color === "#fff4e6", "soft studio key colour mirrored");
  assert(soft.key.azimuth === 40 && soft.key.elevation === 55, "soft studio key angles mirrored");
  assert(soft.fill.azimuth === -55, "soft studio fill angle mirrored");
  assert(soft.rim.azimuth === 165, "soft studio rim angle mirrored");
  assert(Object.keys(LIGHT_RECIPES).length === 4, "all four proskena recipes present");
  assert(LIGHT_RECIPES.dramatic_rim.ambience === "dark", "dramatic rim is the dark room");
});

Deno.test("a recipe becomes prompt language, not numbers", () => {
  const prompt = lightingPrompt(defaultSet());
  assert(prompt.includes("key light from camera right"), "azimuth 40 reads as camera right");
  assert(prompt.includes("warm"), "the key's #fff4e6 reads as warm");
  assert(prompt.includes("camera left"), "the fill's -55 reads as camera left");
  assert(prompt.includes("rim light behind"), "azimuth 165 reads as behind");
  assert(prompt.includes("bright even room"), "bright ambience reads as a bright room");
  assert(!/azimuth|elevation|degrees/.test(prompt), "no raw rig numbers leak into the prompt");

  const dark = lightingPrompt(defaultSet({ lighting: "dramatic_rim" }));
  assert(dark.includes("dim room, deep shadows"), "dark ambience reads as a dim room");
  assert(dark.includes("faint"), "the 0.25 fill reads as faint");
});

Deno.test("the shot reads as a lens and puts the person in front", () => {
  const shot = shotPrompt(defaultSet());
  assert(shot.includes("50mm lens"), "focal length survives as lens language");
  assert(shot.includes("the room falling away softly behind the subject"), "focus is on the subject, not the room");
  assert(shot.includes("static camera, no camera movement"), "no invented camera movement");

  const close = shotPrompt(defaultSet({ shot: { fov: 32, focallength: 85, focaldistance: 200 } }));
  assert(close.includes("close portrait"), "85mm reads as a close portrait");
  assert(close.includes("shallow depth of field"), "a near focal distance reads as shallow dof");
});

Deno.test("the backdrop is two values in words, and it does not move", () => {
  const backdrop = backdropPrompt(defaultSet());
  assert(backdrop.includes("seamless studio backdrop"), "seamless, like the studio backdrop plane");
  assert(backdrop.includes("the same room in every shot"), "the constancy is stated in the prompt");
  assert(backdrop.includes("cream") || backdrop.includes("near-white"), "the tone is described from the hex");
});

Deno.test("a scene clip composes action, backdrop, light and shot", () => {
  const prompt = scenePrompt(defaultSet(), "prixie looks up from the desk and smiles.");
  assert(prompt.startsWith("prixie looks up from the desk and smiles."), "the action leads");
  assert(prompt.includes("key light from"), "the light is in the prompt");
  assert(prompt.includes("static camera"), "the shot is in the prompt");
});

Deno.test("pinning the set adds the look then pins the conversation", async () => {
  const avatar = { avatarId: "av1" } as any;
  const handle = { conversationId: "conv1", shareSlug: "c-test", liveUrl: "l", isPublic: false } as any;
  const look = await pinSet(avatar, handle, "https://proskena/export/desk-still.png");

  const add = calls.find((c) => c.url.endsWith("/avatars/av1/images") && c.method === "POST");
  assert(add != null, "the still is added as an avatar look");
  assert(add!.body.imageUrl === "https://proskena/export/desk-still.png", "the authored still is what gets added");

  const pin = calls.find((c) => c.url.endsWith("/conversations/conv1/avatar-image") && c.method === "POST");
  assert(pin != null, "the conversation is pinned to the frame");
  assert(
    pin!.body.avatarImageUrl === "https://masky/avatars/av1/as9.png",
    "the stored url is pinned, not the source url (speak only accepts stored looks)",
  );
  assert(look.url === "https://masky/avatars/av1/as9.png", "pinSet returns the stored look");
});
