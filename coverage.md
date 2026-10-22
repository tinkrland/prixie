# coverage

where prixie can actually be, today. every row is the honest state of
the repo at the time of writing, not a wish. statuses mean:

- **working**: shipped, tested, in the loop
- **partial**: shipped with a named limit or a gated path
- **designed**: fields, types, or docs exist; the flow is not built yet
- **planned**: the route exists on the honest map, nothing is built
- **not possible**: verified against the platform's current api; a
  person stays in that loop

lowercase always. the docket does not judge a gap.

## meeting platforms

the platforms she can join, and how she gets in the room.

| platform | status | how she joins | notes |
| --- | --- | --- | --- |
| zoom | working | zoom web sdk as a real participant (browserbase loads a hosted page, join url parsed, signature signed via /api/zoom/signature); browserbase join as the fallback path | chat, reactions, raise hand all work as a participant. the q&a panel is webinar-scoped: she tries, no promises. waiting room: she joins and waits, status waiting_room |
| google meet | working | browserbase join engine, anonymous by default | the default auth mode for meet |
| microsoft teams | working | browserbase join engine | anonymous guest path |
| discord | working (watch), planned (join) | the room watch is live (backend/src/services/discord_watcher.ts): one gateway connection per server reads voice states + scheduled events, so a call being open is a fact she sees, not a guess. joining the call is the planned api path: webrtc audio in through the voice gateway | limits, verified oct 22 2026: dm calls and group dm calls are invisible to bots; she would arrive with a bot tag; the bot api does not let her view screenshares |
| slack | partial (channel scan), planned (huddle join) | live_links scans slack channels for links posted in real time. joining a huddle is planned: slack's api does not surface huddle links to apps, so the path is a pre-authenticated browserbase context watching the channel | huddle join is browser, not api |
| ringcentral | planned | browserbase fallback: open the link, automate the join, capture audio, transcribe | no recall.ai support ever; the browser is the engine |
| bluejeans | planned | browserbase fallback, same shape as ringcentral | same browser path |
| webex / gather.town / others | planned | generic browserbase join (joinGeneric) covers any web meeting page today, with per-platform automation as the polish step | gather.town: space url plus a pre-authenticated profile |

## calendar sync

where meetings are discovered before the link ever lands anywhere else.

| calendar | status | notes |
| --- | --- | --- |
| google calendar | working | automatic meeting discovery, connector-triggered sync workflow, sync tokens (SyncState) |
| apple calendar | working | caldav, pulled per cycle from APPLE_CALDAV_* creds; unset creds are skipped, never faked |
| microsoft calendar | working | outlook via the graph api, OUTLOOK_ACCESS_TOKEN per cycle; same skip rule |
| notion | working | calendar source wired into the scheduler alongside the others |
| cal.com | working | v2 bookings api as a calendar source |
| zcal | working | via the host calendar: the booking lands on the host's calendar and she reads it there |

## registration through

where she registers for an event when the link is behind a signup.

| registration source | status | notes |
| --- | --- | --- |
| lu.ma | working (register-then-source) | the signup gate is the point: she registers first, then reads. events that expose the link to registered guests are joined immediately; events that hold the link until the confirmation return needs_link: true and the inbox path completes the sourcing when the confirmation arrives |
| calendly | working | calendly integration service syncs events and extracts meeting links (CALENDLY_API_KEY) |
| cal.com | working | v2 bookings api: the booking and its join link arrive as a calendar source |
| zcal | working | via the host calendar, the same way the calendar sync reads it |
| eventbrite | planned | same shape as luma: register, then source the link from the confirmation path |
| zoom webinars / teams live events | planned | registration-locked; same register-then-source shape as luma |

## source links through

every way a meeting link can reach her, monitored live.

| source | status | notes |
| --- | --- | --- |
| email | working | agentmail inbox is link sourcing's first citizen: forward the invite to her dedicated address, the webhook (x-agentmail-secret) parses it, extractMeetingUrl finds the link. no time in the email means she joins in 5 minutes |
| slack channels | working | live_links scans slack channels for links posted in real time |
| discord channels | working | live_links scans discord channels the same way; the room watch (above) covers the calls themselves |
| forums | working | forum_links scans subreddits, discourse forums, mlh events (devpost-shaped community sources) |
| calendar itself | working | a calendar event that carries its own join url is sourced directly, no other channel needed |
| chat posts in-meeting | working | once she is in a meeting, links posted in chat are captured (captured_chat_links) |

## relay information back

how what she learned gets back to the owner. built today, then the
honest not-built list.

| channel | status | notes |
| --- | --- | --- |
| email (agentmail outbound) | working | notifyOwner sends the take-home to PRIXIE_OWNER_EMAIL using the creds she already has from the inbound side |
| this chat (the superagent) | working | the meeting manager workflow's agent step delivers transcripts + capture results in the owner conversation |
| imessage | not built | same notifyOwner seam, not wired |
| signal | not built | same seam |
| whatsapp | not built | same seam |
| telegram | not built | same seam |
| slack dm | not built | same seam |
| discord dm | not built | same seam |
| sms | not built | same seam |

every later channel plugs into the same notifyOwner call; that is the
whole design of the seam.

## pre-meeting task checklist features

what she has assigned and prepared before she ever joins.

| feature | status | notes |
| --- | --- | --- |
| capture requests | working | pre-assigned per meeting (what to fetch, what to ask, what to mark attendance); keywords, questions, screenshot flags all ride on the meeting's requests |
| prepared questions | working (assigned), voice asking on the voice branch | CaptureRequest questions are assigned pre-meeting; asking them out loud is the voice branch's transport (q&a flow below coordinates) |
| profile / persona selection | designed | sandboxed identities, per-profile memory, shared global memory; profiles + profile_memory + global_memory exist in the schema |
| colloquial timezone conversion | working | "3 pst", "evening for me" style references are converted to a joinable time |
| the docket | working | not a schedule: each meeting is a watch with approximate details, regenerated from the live list every cycle, never a promise |
| doc access | working | pre-meeting doc fetching for context she should walk in with |
| join delay scheduling | working | the default trigger: she joins n minutes after start, set per meeting |
| participant-triggered join | working | hold until n humans are already inside, read from the pre-join page. a page that will not say is a hold, never a guess |

## during joining checklist features

what happens between the join url and being in the room.

| feature | status | notes |
| --- | --- | --- |
| waiting room handling | working | zoom waiting rooms: she joins and waits, status waiting_room, no guesswork about being let in |
| join triggers | working | delay (default, n minutes after start) or participants (n humans already inside from the pre-join page read) |
| auth modes | working | anonymous by default; zoom signature (HMAC-SHA256) signed via /api/zoom/signature when the meeting wants a signed participant; registration-gated events follow register-then-source |
| camera off | working | she joins silently: camera off by default, always. the face is opt-in and lives on the video branch |
| mic off | working | mic off by default; it turns on only for the voice feature's speaking turns |
| late join | working | she joins ongoing meetings gracefully; the docket does not judge it |
| join url safety | working | link_safety checks a url before she follows it |

## post joining checklist features

what she does once she is in the room.

| feature | status | notes |
| --- | --- | --- |
| attendance marking by chat message | working | "present!" style messages in the meeting chat, per the meeting's attendance_method; AttendanceMessage records what was sent, when, and why |
| attendance by google form | working | pre-set attendance forms are filled (enterForm); the fill is recorded as the attendance receipt |
| attendance forms found in chat | working | chat_form_attendance: a form link posted in-meeting that the host language marks as attendance is filled; a bare form link with no attendance context is NOT hers to touch |
| transcript retrieval | working | assembly.ai transcription through the meeting transcript pipeline; Transcript stores the full text |
| capture request answering | working | keywords watched in chat and transcript; screenshots on request; chat links captured; answers recorded per request |
| term detection | working | term_detector picks up codes, access info, and other take-home terms from the live text |
| host identification | working | the host name is read from the room and carried into the take-home |
| relay back to owner | working (email + this chat) | the notifyOwner seam; the imessage / signal / whatsapp / telegram / dm list above is the honest not-built remainder |

## interactive participation meeting features

how she takes part in the room, not just listens.

| feature | status | notes |
| --- | --- | --- |
| q&a flow | working | qna_flow: she waits for the "any questions?" moment, watches raised hands, asks permission in chat, and posts her question in the window. three honest paths: hands-up, asked_permission, asked_in_chat |
| raise hand | working | zoom web sdk participant path (recall's limits were recall's, not zoom's) |
| chat messages | working | she posts in meeting chat: questions, attendance marks |
| reactions | working | zoom web sdk participant reactions |
| asking out loud (voice) | working (transport on the voice branch) | the q&a flow coordinates when to speak; the livekit audio transport does the speaking. barging and interruption handling are assembly.ai's job, never custom logic |
| breakout rooms | designed | breakout_room_id / breakout_room_mode live on the Meeting entity; the join-and-follow flow is not built yet |
| screenshare awareness | planned | she knows a share is up; reading it is a later step |

## take home features

what is waiting for the owner after the meeting ends.

| take-home | status | notes |
| --- | --- | --- |
| full transcript | working | the complete transcript, searchable; assembly.ai is the engine |
| capture answers | working | every capture request answered with what was found: captured_content, captured links, screenshots |
| answers with timestamps | working (recap branch) | h:mm:ss citations back into the transcript, never a summary standing in for the source; the recap branch owns that surface |
| the questions you asked her to ask | working | the answer to each prepared CaptureRequest question, quoted from the room |
| attendance receipts | working | the message text, sent_at, sent_status, and trigger for every attendance mark, plus form fills |
| codes and access info | working | term_detector's take-home terms (hackathon access codes, join info) relayed verbatim, never paraphrased |
| screenshots | working | captured on request, stored, linked in the take-home |
| summaries | working | meeting summaries stored with the transcript on main |
