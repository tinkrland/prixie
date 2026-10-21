// assembly.ai (the owner, oct 21 2026): the audio layer is TOGGLED, never
// ambient. "wire the audio assembly.ai part only if the person setting
// it up toggles it on is it used" - so:
//
//   ASSEMBLYAI_ENABLED=true + ASSEMBLYAI_API_KEY set  -> layer is on
//   anything else                                    -> layer is off,
//     honestly reported, never faked, no key ever required elsewhere
//
// and the mic question she raised: when the obs bridge is active, the
// meeting's mic track IS the obs virtual mic. the audio she "speaks"
// arrives through masky's livekit publish -> obs -> virtual mic, so the
// hosted join page is not the one making sound; it only unmutes and the
// obs side plays the audio. when obs is not in the stack, the page's
// own speech synthesis is the fallback voice. resolution below.

export type AudioMode =
  | "obs" // the obs mic override owns the audio (livekit/assembly path)
  | "page" // the hosted page speaks (speech synthesis fallback)
  ;

// which stack owns her out-loud audio. obs mode when she runs with the
// obs bridge (PRIXIE_AUDIO_MODE=obs or OBS_WS_URL set); page mode
// otherwise. the caller honors it; neither mode touches the camera.
export function resolveAudioMode(): AudioMode {
  const mode = Deno.env.get("PRIXIE_AUDIO_MODE");
  if (mode === "obs") return "obs";
  if (Deno.env.get("OBS_WS_URL")) return "obs";
  return "page";
}

// the assembly.ai toggle. the person setting it up decides; default is
// off and everything downstream degrades honestly without it.
export function assemblyEnabled(): boolean {
  return Deno.env.get("ASSEMBLYAI_ENABLED") === "true" &&
    !!Deno.env.get("ASSEMBLYAI_API_KEY");
}

// transcribe an audio url (her out-loud ask, a recording clip) through
// assembly.ai, ONLY when the toggle is on. off = null, never a guess.
export async function transcribeAudioUrl(url: string): Promise<string | null> {
  if (!assemblyEnabled()) return null;

  const key = Deno.env.get("ASSEMBLYAI_API_KEY")!;
  try {
    const create = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: { authorization: key, "content-type": "application/json" },
      body: JSON.stringify({ audio_url: url }),
    });
    if (!create.ok) {
      console.warn(`prixie: assemblyai create failed: ${create.status}`);
      return null;
    }
    const created = await create.json();

    // poll until done, bounded: a stuck transcript is null, not a loop
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${created.id}`, {
        headers: { authorization: key },
      });
      const data = await poll.json();
      if (data.status === "completed") return data.text || null;
      if (data.status === "error") {
        console.warn(`prixie: assemblyai transcript error: ${data.error}`);
        return null;
      }
    }
    console.warn("prixie: assemblyai transcript timed out");
    return null;
  } catch (err: any) {
    console.warn(`prixie: assemblyai transcription errored: ${err.message}`);
    return null;
  }
}
