// the docket generator (the owner, oct 21 2026): prixie has a docket, not
// a schedule. this script reads the live meeting list + capture
// requests from the token-gated proxy api and rewrites the docket
// README on the orphan `docket` branch, so its github preview always
// shows everything she needs: what to fetch, what to ask, what to
// mark attendance, and what state each watch is in.
//
// the docket holds watches, not promises: times are approximate,
// platforms unconfirmed until a link lands on slack / discord / a
// huddle. an empty docket stays empty: no entry is fabricated to
// fill the page, and no em dash ever appears in the writing.

async function main() {
  // env comes from the process (deno run --env-file or exports)
  const base = Deno.env.get("PROXY_BASE_URL") || "http://localhost:3000";
  const token = Deno.env.get("PRIXIE_API_TOKEN");
  if (!token) {
    console.error("prixie: PRIXIE_API_TOKEN is not set; the docket cannot read the api. closed is closed.");
    Deno.exit(1);
  }

  // read the live list, honestly
  const res = await fetch(`${base}/api/meetings`, {
    headers: { "x-api-token": token },
  });
  if (!res.ok) {
    console.error(`prixie: docket read failed: ${res.status}. the docket is NOT rewritten on a failed read.`);
    Deno.exit(1);
  }
  const meetings = (await res.json()) as any[];
  const active = meetings.filter((m) => m.status !== "failed");
  const open = active.filter((m) => !m.status || m.status === "scheduled");

  // capture requests per meeting, from the same honest source
  const withRequests = await Promise.all(
    active.map(async (m) => {
      const rr = await fetch(`${base}/api/meetings/${m.id}/capture-requests`, {
        headers: { "x-api-token": token },
      });
      const requests = rr.ok ? await rr.json() : [];
      return { meeting: m, requests };
    }),
  );

  // render the calendar section
  const entries = withRequests.map(({ meeting, requests }) => {
    const asks = requests.filter((r: any) => r.type === "ask").map((r: any) => r.question || r.title);
    const fetches = requests.filter((r: any) => r.type !== "ask").map((r: any) => r.title || r.keywords);
    const lines = [
      `### [${meeting.status || "scheduled"}] ${meeting.title || "untitled watch"}`,
      `- when: ${meeting.start_time || "unknown (approximate anyway)"}`,
      `- platform: ${meeting.platform || "unknown until the link lands"}`,
      `- link: ${meeting.join_url ? "on the docket" : "pending, watching slack / discord / huddle"}`,
    ];
    if (fetches.length) lines.push(`- what to fetch: ${fetches.join("; ")}`);
    if (asks.length) lines.push(`- what to ask: ${asks.join("; ")}`);
    lines.push(`- what to mark attendance: ${meeting.attendance_method || "chat message"}`);
    return lines.join("\n");
  });

  const calendar = entries.length
    ? entries.join("\n\n")
    : "nothing is on the docket right now. this section regenerates from the live meeting list every time this script runs. an empty docket is an honest docket: no watch is fabricated to fill the page.";

  // the discord rooms, live: open voice channels (a call is open when
  // someone is in a channel) and the guild's watchable events. this is
  // the docket's look-out made real: she watches the rooms, not just
  // the calendar. a failed read keeps the docket calendar-only: the
  // section never fabricates a room.
  let discord = "";
  try {
    const dr = await fetch(`${base}/api/discord/state`, {
      headers: { "x-api-token": token },
    });
    if (dr.ok) {
      const d = await dr.json();
      const roomLines: string[] = [];
      for (const vc of d.openVoiceChannels ?? []) {
        const who = vc.occupants.map((o: any) => o.name || o.userId).join(", ");
        roomLines.push(
          `- a call is open in voice channel ${vc.channelId}: ${who}`,
        );
      }
      for (const e of d.events ?? []) {
        roomLines.push(
          `- [${e.statusName}] event "${e.name}" starts ${e.scheduledStartTime}` +
            (e.userCount !== null ? `, ${e.userCount} interested` : "") +
            `: ${e.deepLink} (rsvp is yours to tap, not hers)`,
        );
      }
      discord = roomLines.length
        ? roomLines.join("\n")
        : "the discord watch is running and the rooms are quiet right now. no call is open, no event is upcoming. quiet is honest too.";
    } else {
      discord = "the discord watch is not up right now. the rooms go unlisted until it is.";
    }
  } catch {
    discord = "the discord watch could not be read. the rooms go unlisted until it can be.";
  }

  const readme = DOCKET_TEMPLATE
    .replace("<!--calendar-->", calendar)
    .replace("<!--discord-->", discord);
  await Deno.writeTextFile("/tmp/docket-readme.md", readme);
  console.log(`prixie: docket rendered for ${withRequests.length} watch(es), written to /tmp/docket-readme.md`);
  console.log("commit it to the docket branch: git worktree add /tmp/wt-docket docket, then copy + commit + push.");
}

const DOCKET_TEMPLATE = `# the docket

prixie does not have a schedule. she has a docket.

a schedule says: this meeting is at 3, be there at 3. a docket says:
this is roughly what is coming, watch for it. the people she watches
for are haphazard. they do not pre-plan, they do not stick to strict
somethings, and they change things late. she knows this. she is
patient. sometimes life happens, and the docket does not judge it.

## what a docket entry is

each entry below is a watch, not a promise:

- a meeting appears on the docket with approximate details. the time
  might be wrong. the platform might be wrong. the title is a hint,
  not a contract.
- she keeps a look out, because someone will end up sending the
  actual meeting link somewhere: on slack, on discord, or maybe they
  just start a huddle. she monitors those places.
- when the link shows up, she joins. when it does not, the entry
  stays on the docket, patient. life happens.

## the calendar

<!--calendar-->

## the discord rooms, live

<!--discord-->

## regeneration

this branch is an orphan: it shares no history with the code. it
exists so that anyone (including prixie herself) can read her whole
docket from one preview. backend/scripts/docket.ts on main is the
only thing that writes here; nothing on this branch is hand-edited.

lowercase always. no dashes that em. patience is a feature.
`;

if (import.meta.main) {
  main();
}
