// assembly.ai toggle tests: off unless the person setting it up says so.

import { assertEquals } from "jsr:@std/assert@1";
import { resolveAudioMode, assemblyEnabled, transcribeAudioUrl } from "./assemblyai.ts";

Deno.test("obs mode when the obs bridge is in the stack, page otherwise", () => {
  Deno.env.delete("PRIXIE_AUDIO_MODE");
  Deno.env.delete("OBS_WS_URL");
  assertEquals(resolveAudioMode(), "page");

  Deno.env.set("PRIXIE_AUDIO_MODE", "obs");
  assertEquals(resolveAudioMode(), "obs");
  Deno.env.delete("PRIXIE_AUDIO_MODE");

  Deno.env.set("OBS_WS_URL", "ws://obs.local:4455");
  assertEquals(resolveAudioMode(), "obs");
  Deno.env.delete("OBS_WS_URL");
});

Deno.test("the layer is off unless toggled on with a key", async () => {
  Deno.env.delete("ASSEMBLYAI_ENABLED");
  Deno.env.delete("ASSEMBLYAI_API_KEY");
  assertEquals(assemblyEnabled(), false);
  assertEquals(await transcribeAudioUrl("https://example.com/a.wav"), null);

  Deno.env.set("ASSEMBLYAI_ENABLED", "true");
  assertEquals(assemblyEnabled(), false); // enabled without key = still off
  Deno.env.set("ASSEMBLYAI_API_KEY", "fake");
  assertEquals(assemblyEnabled(), true);
  Deno.env.delete("ASSEMBLYAI_ENABLED");
  Deno.env.delete("ASSEMBLYAI_API_KEY");
});
