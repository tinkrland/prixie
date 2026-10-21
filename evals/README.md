# voice cue evals

the mapping from a persona's voice profile (tone defaults 0..1, register per
medium) to masky's named delivery cues is the one place where retelldb's fuzzy
persona vocabulary meets masky's enums. it needs an eval set, not five
hand-written asserts.

two sources feed this set:

1. `voice_cues_seed.json`, hand-written here, covering the mapping's current
   behaviour and the gaps we already know about.
2. rows invented through adaptionlabs.ai (dataset id 0d028f05-7b37-44e9-bc86-
   d626d535d4bf, "prixie voice profile to delivery cues", instruction_dataset,
   60 rows, 58 parsed) converted by `scripts/build_voice_cue_evals.py`.
   provenance: the adaptionlabs dataset id, the row index, and the raw
   generated text stay in the converted file, so any expectation can be traced
   back to the row that suggested it. the invented rows are per-segment
   mappings (an utterance split into beats, each with its own cues and inline
   tags), so a case's `required` is its opening segment, the part a single
   voiceStyle can score, and the rest rides along as `segments` + `inline`:
   the per-beat delivery roadmap in hand.

current score: 69 cases (11 seed, 58 adapted), 8 pass, 61 mapping gaps, 0
failures. the invented rows want delivery the mapping cannot produce yet:
whispering as a style (42 rows), pitch shifts (68), per-beat emotion changes,
and inline tags everywhere (83 pauses, 57 sighs, 50 laughs). that is the
extension list, measured, not guessed.

## running it

```
deno test --allow-env --allow-net --allow-read tests/voice_cue_eval_test.ts
```

the harness scores every case against `voiceStyleFromProfile` and prints the
gaps: expectations the current mapping cannot produce. gaps are reported, not
failed, because they are extension candidates for the mapping rather than bugs
in it. known gaps today:

- no support for emotions outside the four the profile can imply (contemplation
  for a reflective line, relief for an announcement landing, awe, surprise,
  anger when a tone spikes).
- no pitch cues (pitch_high for excitement, pitch_low for gravitas).
- no inline delivery tags at all: no `<|sfx:laughter|>` for a genuinely amused
  line, no `<|prosody:pause|>` before a correction. the mapping only sets
  leading cues (voiceStyle), never in-text ones, and in-text cues are what make
  a line sound like a person instead of a narrator.
- register handling covers whispered/hushed only; stage/formal/rapid registers
  are read by the caller for wording and never reach the tts.
