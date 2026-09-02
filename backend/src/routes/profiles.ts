import { Hono } from "hono";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const app = new Hono();

// list profiles
app.get("/", async (c) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data || []);
});

// get single profile
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// create profile
app.post("/", async (c) => {
  const body = await c.req.json();
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      name: body.name,
      display_name: body.display_name || body.name,
      email: body.email,
      context: body.context,
      shared_memory: body.shared_memory ?? true,
      is_default: false,
      // voice config
      voice_id: body.voice_id,
      tone: body.tone || "neutral",
      initiative_level: body.initiative_level || "passive",
      question_style: body.question_style || "direct",
      language_preference: body.language_preference || "en",
      // fist — rhythmic signature
      fist_score: body.fist_score ?? 0.7,
      fist_timing_variation: body.fist_timing_variation ?? 0.35,
      fist_rhythm_stability: body.fist_rhythm_stability ?? 0.72,
      fist_pause_pattern: body.fist_pause_pattern || "deliberate",
      fist_startup_pattern: body.fist_startup_pattern || "brief_pause",
      fist_turn_entry_pattern: body.fist_turn_entry_pattern || "beat",
      cadence_wpm: body.cadence_wpm ?? 140,
      prosody: body.prosody ?? 0.4,
      seriousness: body.seriousness ?? 0.7,
      professionalism: body.professionalism ?? 0.5,
      vocabulary: body.vocabulary ?? 0.5,
    })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// update profile
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { data, error } = await supabase
    .from("profiles")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// delete profile
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ status: "deleted" });
});

export default app;
