// the matte stage: remove the background of the person video. rembg (u2net)
// per frame, alpha out, same size and rate as the input so the matte can ride
// the person's framing chain exactly (scripts/matte.py does the work; this is
// the pipeline's typed handle on it).

export interface MatteOptions {
  start?: number; // seconds into the clip
  duration?: number; // seconds to process; undefined = the whole clip
}

export function buildMatteCmd(person: string, out: string, opts: MatteOptions = {}): string[] {
  const cmd = ["python3", "scripts/matte.py", "--in", person, "--out", out];
  if (opts.start !== undefined) cmd.push("--start", String(opts.start));
  if (opts.duration !== undefined) cmd.push("--duration", String(opts.duration));
  return cmd;
}
