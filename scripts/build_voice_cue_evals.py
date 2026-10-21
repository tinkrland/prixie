#!/usr/bin/env python3
"""Convert an adaptionlabs invented dataset into eval cases for the mapping.

the invented rows are prose, so this pulls out what is structural and keeps the
rest as context: tone scores (0..1), the medium/register if named, the
utterance, and the delivery cues the row expects, matched against the enum
lists masky actually accepts. anything the row says that does not parse into a
cue is left out of the expectations rather than guessed.

provenance stays in every case: the adaptionlabs dataset id, the row index, and
the raw generated text, so an expectation can always be traced to its row.

usage:
  python3 scripts/build_voice_cue_evals.py /tmp/adaption_voice_cues.dat \
      --dataset-id 0d028f05-7b37-44e9-bc86-d626d535d4bf \
      -o evals/voice_cues_adapted.json
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

EMOTIONS = [
    "elation", "amusement", "enthusiasm", "determination", "pride",
    "contentment", "affection", "relief", "contemplation", "confusion",
    "surprise", "awe", "longing", "arousal", "anger", "fear", "disgust",
    "bitterness", "sadness", "shame", "helplessness",
]
STYLES = ["singing", "shouting", "whispering"]
PROSODY = [
    "speed_very_slow", "speed_slow", "speed_fast", "speed_very_fast",
    "pitch_low", "pitch_high", "expressive_high", "expressive_low",
]
SFX = ["cough", "laughter", "crying", "screaming", "burping", "humming", "sigh", "sniff", "sneeze"]

TONES = ["warmth", "sarcasm_level", "playfulness", "confidence"]


def read_rows(path: Path) -> list[dict]:
    text = path.read_text(errors="replace")
    if text.lstrip().startswith("{") and "\n{" in text:
        return [json.loads(line) for line in text.splitlines() if line.strip().startswith("{")]
    # csv, as the download endpoint defaults to it
    return list(csv.DictReader(text.splitlines()))


def tone_scores(text: str) -> dict[str, float]:
    scores: dict[str, float] = {}
    for tone in TONES:
        m = re.search(rf"{tone}\D{{0,12}}(0?\.\d+|0|1)\b", text, re.IGNORECASE)
        if m:
            try:
                v = float(m.group(1))
                if 0.0 <= v <= 1.0:
                    scores[tone] = v
            except ValueError:
                pass
    return scores


def cues_in(text: str, utterance: str) -> tuple[list[str], list[str]]:
    """(leading cues, inline tag cues) the row expects."""
    low = text.lower()
    leading: list[str] = []
    for e in EMOTIONS:
        if re.search(rf"emotion[^\n]{{0,30}}[:=]?\s*\"?{e}\b", low):
            leading.append(f"emotion={e}")
    for s in STYLES:
        if re.search(rf"style[^\n]{{0,30}}[:=]?\s*\"?{s}\b", low):
            leading.append(f"style={s}")
    for p in PROSODY:
        if re.search(rf"prosody[^\n]{{0,40}}{p}\b", low):
            leading.append(f"prosody={p}")

    inline: list[str] = []
    for m in re.finditer(r"<\|(sfx|prosody):([a-z_]+)\|>", utterance):
        inline.append(f"{m.group(1)}={m.group(2)}")
    for s in SFX:
        if re.search(rf"<\|sfx:{s}\|>", low):
            inline.append(f"sfx={s}")
    # de-dup, order stable
    return list(dict.fromkeys(leading)), list(dict.fromkeys(inline))


def medium(text: str) -> tuple[str, str | None]:
    m = re.search(r"register_by_medium[^\n]{0,80}?\"?(call|meeting|stage|phone|room)\"?\s*[:=]\s*\"([^\"]{2,80})\"", text, re.IGNORECASE)
    if m:
        return m.group(1).lower(), m.group(2)
    m = re.search(r"\b(call|meeting|stage)\s+register\b[^\n]{0,60}", text, re.IGNORECASE)
    if m:
        return m.group(1).lower(), m.group(0)
    return "call", None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset_file")
    ap.add_argument("--dataset-id", required=True)
    ap.add_argument("-o", "--out", default="evals/voice_cues_adapted.json")
    args = ap.parse_args()

    rows = read_rows(Path(args.dataset_file))
    cases = []
    for i, row in enumerate(rows):
        prompt = row.get("enhanced_prompt") or row.get("prompt") or row.get("original_prompt") or ""
        completion = (
            row.get("enhanced_completion")
            or row.get("completion")
            or row.get("original_completion")
            or row.get("chosen")
            or ""
        )
        blob = f"{prompt}\n{completion}"
        tones = tone_scores(blob)
        if not tones:
            continue  # no structural tone signal, skip rather than guess
        med, register = medium(blob)
        utterance = ""
        m = re.search(r"utterance[^\n]{0,20}[:=]\s*\"([^\"]{5,400})\"", blob, re.IGNORECASE)
        if m:
            utterance = m.group(1)
        leading, inline = cues_in(blob, f"{blob} {utterance}")
        if not leading and not inline:
            continue
        cases.append({
            "name": f"adaptionlabs_row_{i:03d}",
            "source": "adaptionlabs",
            "dataset_id": args.dataset_id,
            "row_index": i,
            "profile": {"tone": tones, "register": ({med: register} if register else {})},
            "medium": med,
            "utterance": utterance,
            "required": leading + inline,
            "forbidden": [],
            "raw": blob[:1200],
        })

    out = {
        "source": "adaptionlabs.ai invented dataset",
        "dataset_id": args.dataset_id,
        "rows_read": len(rows),
        "cases_parsed": len(cases),
        "note": "rows without a parsable tone signal or cue expectation are skipped, not guessed",
        "cases": cases,
    }
    Path(args.out).write_text(json.dumps(out, indent=2))
    print(f"rows read: {len(rows)} | cases parsed: {len(cases)} -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
