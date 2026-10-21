# link sourcing

a meeting link is the front door. prixie's whole job starts at "she is in the room", and every way a link can reach her is a sourcing path. this doc is the honest map of each one: what works, what is gated, what is planned, and what is not possible without a person in the loop.

the principle: she never invents a link, and she never pretends one is visible when it is not. when a path is gated, the gate is named and the door stays open (the confirmation email, the host calendar) rather than faked.

## the paths, in the order they matter

| source | status | how |
| --- | --- | --- |
| agentmail inbox | working | link sourcing's first citizen. forward the invite to her dedicated agentmail address, the webhook (x-agentmail-secret) parses it, `extractMeetingUrl` finds the link, the meeting is created. no time in the email means she joins in 5 minutes |
| host calendars | working | google, microsoft graph, apple caldav, notion, cal.com (v2 bookings api), zcal (via the host calendar). the meeting on a calendar comes with its join url; each source is pulled per cycle, unset creds are skipped, never faked |
| luma | working (registered) | the signup gate is the point: she registers first, then reads. events that expose the meeting link to registered guests are joined immediately; events that hold the link until the confirmation email return `needs_link: true` and the inbox path completes the sourcing when the confirmation arrives |
| discord calls | planned | no api hands out a voice channel link. the path is the browserbase fallback: she holds a pre-authenticated browser context for the server, watches the channel, and joins when a call starts. requires the server's auth to be hers (see the honest limits) |
| slack huddles | planned | slack's api does not surface huddle links to apps. the path is the same as discord: a pre-authenticated browserbase context watching the channel for the huddle to start |
| zoom webinars, teams live events | planned | registration-locked. same shape as luma: register, then source the link from the confirmation path |
| ringcentral, bluejeans | planned | browserbase fallback: open the link, automate the join, capture audio, transcribe. no recall.ai support, so the browser is the engine |
| gather.town | planned | the browserbase fallback again: the space url plus a pre-authenticated profile. she joins as a participant in the space |
| forums (reddit, discourse, mlh) | planned | event posts carry links to offsite calls. the path is a watcher on the forum's public feeds that hands found links to the inbox flow. she joins, she does not post |

## the honest limits

- a link behind a login she does not have is a gate, not a wall. the answer is giving her the credential (a pre-authenticated browserbase context for a discord server, a slack workspace) and then the path opens. what she will never do is bypass an auth she was not given.
- some confirmations only reach a human inbox. when luma or a webinar holds the link until the confirmation email, she registers and then waits; the inbox webhook completes it. `needs_link: true` is that wait, stated.
- cantina.com has no public api. direct contact is the only path there; it is documented as such in the video branch and will not be faked here either.

## what a sourced link becomes

every sourced link flows into one shape: a meeting record with platform, join url, start time, join trigger (`delay` or `participants`), and the capture requests you attached. the sourcing is many doors; the room is always the same.
