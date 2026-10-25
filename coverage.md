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

| platform | surface | status | how she joins | notes |
| --- | --- | --- | --- | --- |
| zoom |  | working | zoom web sdk as a real participant (browserbase loads a hosted page, join url parsed, signature signed via /api/zoom/signature); browserbase join as the fallback path | chat, reactions, raise hand all work as a participant. the q&a panel is webinar-scoped: she tries, no promises. waiting room: she joins and waits, status waiting_room |
| google meet |  | working | browserbase join engine, anonymous by default | the default auth mode for meet |
| microsoft teams |  | working | browserbase join engine | anonymous guest path |
| discord | watching | working | the room watch is live (backend/src/services/discord_watcher.ts): one gateway connection per server reads voice states + scheduled events, so a call being open is a fact she sees, not a guess | limits, verified oct 22 2026: dm calls and group dm calls are invisible to bots |
|  | joining | planned | the api path: webrtc audio in through the voice gateway | she would arrive with a bot tag; the bot api does not let her view screenshares |
| slack |  | partial (channel scan), planned (huddle join) | live_links scans slack channels for links posted in real time. joining a huddle is planned: slack's api does not surface huddle links to apps, so the path is a pre-authenticated browserbase context watching the channel | huddle join is browser, not api |
| ringcentral |  | planned | browserbase fallback: open the link, automate the join, capture audio, transcribe | no recall.ai support ever; the browser is the engine |
| bluejeans |  | planned | browserbase fallback, same shape as ringcentral | same browser path |
| webex / gather.town / others |  | planned | generic browserbase join (joinGeneric) covers any web meeting page today, with per-platform automation as the polish step | gather.town: space url plus a pre-authenticated profile |

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

## consent

the standing rules (the owner, oct 22 2026): she never ever accepts cookies
that are not necessary, and she never ever opts into newsletters. not
per-site judgment: a policy module every surface shares
(services/consent.ts), and the banner walk rides every navigation.

| rule | status | how | notes |
| --- | --- | --- | --- |
| necessary-only cookies | working | consentChoice picks reject-all / only-necessary from the banner's buttons; an accept-only banner is left standing and reported, a close button is a dismissal, never an agreement | the walk runs on every navigation: join pages, registrations, doc side sessions, recap fetches |
| no newsletters | working | opt-in boxes are never checked (a pre-checked one is the site's yes, not hers, and gets unchecked); opt-out boxes, tick-to-NOT-be-added, are always hers and she ticks them (enterForm, newsletters_cleared + newsletter_opt_outs on the receipt) | opt-in smells: newsletter, mailing list, marketing, promo emails, subscribe; opt-out shapes: do not wish, not to be added, unsubscribe, prefer not |

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
| imessage | not built | same notifyOwner seam, not wired |
| signal | not built | same seam |
| whatsapp | not built | same seam |
| telegram | not built | same seam |
| line | not built | same seam |
| wechat | not built | same seam |
| slack dm | not built | same seam |
| discord dm | not built | same seam |
| sms | not built | same seam |

every later channel plugs into the same notifyOwner call; that is the
whole design of the seam.

## streaming coverage

she is not only in meetings: she streams. twitch and kick are wired
through the obs bridge today; joining a stream as a webinar (reading
the stream, commenting) is the roadmap shape, confirmed as the
destination for twitch and kick and youtube live both.

| platform | status | how | notes |
| --- | --- | --- | --- |
| twitch | working (streaming) | the obs bridge on [@video](https://github.com/tinkrland/prixie.ai/tree/video): integrations/twitch.ts speaks the obs protocol and the stream key rides the env; she goes live as a stream session (goLive) with the camera toggle honest | joining a twitch stream to read and comment is webinar mode, planned |
| kick | working (streaming) | integrations/kick.ts reads KICK_STREAM_URL / KICK_STREAM_KEY from the env, same obs bridge: adding a platform was adding a file | webinar mode, planned, same shape |
| youtube live | planned | no integration built yet: the stream-out side would be an rtmp push, the join side is webinar mode | on the roadmap (confirmed): she joins youtube live streams to read and comment |

## social media presence coverage

[@socmed](https://github.com/tinkrland/prixie.ai/tree/socmed) renders her presence per platform. the rule is the
pipeline renders, it never publishes: captions, attribution, and
posting stay with the creator. numbers are proskena's platform
reference (checked oct 2026), not a second invented set.

| platform | surface | dimensions | notes |
| --- | --- | --- | --- |
| calls (meeting / livekit) | call | 16:9, 1280x720 | the call surface, no ui bands |
| youtube | long form | 16:9, 1920x1080 (4k 3840x2160 supported) | burned captions live in the bottom tenth; end screens cover the edges late in the video |
|  | shorts | 9:16, 1080x1920, ≤ 3 mins | 14 percent top and bottom ui safe bands (title, engagement rail, comment band) |
|  | thumbnail | 16:9, 3840x2160 (2026 guidance) | the duration badge covers the bottom-right corner: nothing critical there |
| twitch | vod / republish | 16:9, 1920x1080 (1080p60) | the vod inherits the broadcast; the to-youtube republish is a corner-cam composite, not a crop |
| tiktok | vertical | 9:16, 1080x1920 | 14 percent top and bottom ui safe bands |
| instagram / facebook | reels / stories | 9:16, 1080x1920 | 14 percent top and bottom ui safe bands, same shape as shorts |
|  | feed | 4:5, 1080x1350 (3:4 also native) | |
|  | carousel | 1:1, 1080x1080 | |
| pinterest | standard pin | 2:3, 1000x1500 | standard pin |

## recaps

[@recap](https://github.com/tinkrland/prixie.ai/tree/recap): a meeting missed is not a meeting lost. someone
sends the recording link, and the recap pass turns it into the same
take-home a live meeting gets: transcript fetched, ingested, capture
requests answered with h:mm:ss citations back into the source, never
a summary standing in for it.

| source | status | how | notes |
| --- | --- | --- | --- |
| youtube unlisted link | working | yt-dlp fetches the video, assembly.ai transcribes it, retelldb ingests it, capture requests are answered against it | the first-class path: someone sends her the unlisted link |
| youtube live recap | working | same pipeline on the live vod once it exists as a recording | the link arrives the same way |
| twitch rewatch | partial | the yt-dlp transport is real and covers twitch vods, but the end-to-end pass has not been exercised on a twitch vod yet | honest: the pipe is built, the run has not happened |
| sequel.io link rewatch | planned | an ingest adapter is not built: the pipeline is source-agnostic (fetch, transcribe, ingest) but sequel.io's own access rules have not been verified | same shape as the others once the fetch rules are checked |

## pre-meeting task checklist features

what she has assigned and prepared before she ever joins.

| feature | status | notes |
| --- | --- | --- |
| capture requests | working | pre-assigned per meeting (what to fetch, what to ask, what to mark attendance); keywords, questions, screenshot flags all ride on the meeting's requests |
| prepared questions | working (assigned), voice asking on [@voice](https://github.com/tinkrland/prixie.ai/tree/voice) | CaptureRequest questions are assigned pre-meeting; asking them out loud is the [@voice](https://github.com/tinkrland/prixie.ai/tree/voice) transport (q&a flow below coordinates) |
| profile / persona selection | designed | sandboxed identities, per-profile memory, shared global memory; profiles + profile_memory + global_memory exist in the schema |
| colloquial timezone conversion | working | "3pm ist", "tomorrow 9am pt" style prose converts through the source zone exactly once, whatever zone the server runs in (the old version subtracted the offset twice on a non-utc server); email subjects parse through the same path, anchored to the email's own date |
| the docket | working | not a schedule: each meeting is a watch with approximate details, regenerated from the live list every cycle, never a promise |
| doc access | working | pre-meeting doc fetching for context she should walk in with |
| join delay scheduling | working | the default trigger: she joins n minutes after start, set per meeting |
| participant-triggered join | working | hold until n humans are already inside, read from the pre-join page. a page that will not say is a hold, never a guess |

## during joining checklist features

what happens between the join url and being in the room.

| feature | status | notes |
| --- | --- | --- |
| waiting room handling | working | "asked" is not "in": success is the in-call UI being seen, never a clicked button. a meeting stays bot_joining until the page says she entered. nobody answering means she asks again on a bounded cadence (the mods-missed-a-popup badger), and every ask is counted on the result |
| join triggers | working | delay (default, n minutes after start), participants (n humans already inside from the pre-join page read), or room_open (the discord watcher's state: a voice channel with occupants is the call happening, the schedule was a guess) |
| auth modes | working | anonymous by default; zoom signature (HMAC-SHA256) signed via /api/zoom/signature when the meeting wants a signed participant; registration-gated events follow register-then-source |
| zoom registration links | working in principle (built, never live-run) | a zoom.us/meeting/register or /webinar/register link is a signup, not a join (the owner, oct 22 2026). she fills the form in a side session with the form identity (PRIXIE_FORM_NAME / PRIXIE_FORM_EMAIL, never the owner's), reads the real join link off the confirmation page, records it as the meeting's join_url (no cycle registers twice), and joins that. if zoom emails the link instead of showing it, the flow says so and stops; the agentmail inbox path can complete the sourcing when the email lands |
| camera off | working | she joins silently: camera off by default, always. the face is opt-in and lives on [@video](https://github.com/tinkrland/prixie.ai/tree/video) |
| mic off | working | mic off by default; it turns on only for the voice feature's speaking turns |
| late join | working | she joins ongoing meetings gracefully; the docket does not judge it |
| join url safety | working | link_safety checks a url before she follows it; theurltell is her own wheregoes.com (the owner, oct 22 2026): it walks the redirect chain in house (no third party ever sees the url), strips marketing params before the first ping, re-gates every hop, parses meta refresh without executing it, and fails closed on loops, broken chains and 12+ hops. sessions only ever open the DESTINATION: the shortener hop and its pixels are told, never visited. wired into form entry and the shared-doc side session |
| one bot per meeting | working | the deploy claims the row (bot_deploying) before the join runs: overlapping cycles and a second isolate never deploy twice. the claim is a lease with a heartbeat: a live deploy touches it every 5 minutes, so a waiting-room join can run as long as it needs; only a claim whose holder died goes stale and is swept back to scheduled after 15 minutes. the cycle also skips while the previous one is still running. migration 20261022a_bot_deploying.sql adds the status to the db's check constraint (run it before the proxy that uses it) |

## post joining checklist features

what she does once she is in the room.

| feature | method | status | notes |
| --- | --- | --- | --- |
| attendance | via chat | working | "present!" style messages in the meeting chat, per the meeting's attendance_method; AttendanceMessage records what was sent, when, and why |
|  | via form link | working | pre-set attendance forms are filled (enterForm); the fill is recorded as the attendance receipt |
| attendance forms found in chat |  | working | chat_form_attendance: a form link posted in-meeting that the host language marks as attendance is filled; a bare form link with no attendance context is NOT hers to touch |
| chat monitor | at entry, not at deploy | working | the in-page monitor installs the moment the page says she is in the room: immediate joins at deploy, waiting-room admissions at the entry transition (a host letting her in late can no longer leave the room unmonitored), and late joins the same way. idempotent, so no double-reporting |
| transcript retrieval |  | working | assembly.ai transcription through the meeting transcript pipeline; Transcript stores the full text |
| capture request answering |  | working | keywords watched in chat and transcript; screenshots on request; chat links captured; answers recorded per request |
| term detection |  | working | term_detector picks up codes, access info, and other take-home terms from the live text |
| host identification |  | working | the host name is read from the room and carried into the take-home |
| relay back to owner |  | working (email) | the notifyOwner seam; the imessage / signal / line / wechat / whatsapp / telegram / dm list above is the honest not-built remainder |

## interactive participation meeting features

how she takes part in the room, not just listens.

| feature | status | notes |
| --- | --- | --- |
| q&a flow | working | qna_flow: she waits for the "any questions?" moment, watches raised hands, asks permission in chat, and posts her question in the window. three honest paths: hands-up, asked_permission, asked_in_chat |
| raise hand | working | zoom web sdk participant path (recall's limits were recall's, not zoom's) |
| chat messages | working | she posts in meeting chat: questions, attendance marks |
| chat dm to one person | working | she can speak to the whole room or dm one person (the organizer case). page seam first (prixieSendChat -> ZoomMtg.sendChat with the matched userId) with a To:-dropdown fallback in the generic web client. the one rule: a dm that cannot be made is NOT broadcast; the caller picks the fallback, never the seam. the host's "participants can chat with" setting is the honest gate, never bypassed. the q&a permission ask dms the host by name when she read who runs the room, and falls back to everyone explicitly |
| screenshare control | working | she does not share a screen in general; the show-and-tell moment is the on-demand microvm's job. these seams are the switch: setScreenshareInSession start/stop (page seam prixieShareScreen -> ZoomMtg.shareScreen first, dom share button as the fallback), provider seams + POST /api/meetings/:id/screenshare. from a cloud browser she shares the page's own view (canvas renders), no standing vm |
| reactions | working | zoom web sdk participant reactions |
| asking out loud (voice) | working (transport on [@voice](https://github.com/tinkrland/prixie.ai/tree/voice)) | the q&a flow coordinates when to speak; the livekit audio transport does the speaking. barging and interruption handling are assembly.ai's job, never custom logic |
| breakout rooms | designed | breakout_room_id / breakout_room_mode live on the Meeting entity; the join-and-follow flow is not built yet |
| screenshare awareness | planned | she knows a share is up; reading it is a later step |

## take home features

what is waiting for the owner after the meeting ends.

| take-home | status | notes |
| --- | --- | --- |
| full transcript | working | the complete transcript, searchable; assembly.ai is the engine |
| capture answers | working | every capture request answered with what was found: captured_content, captured links, screenshots |
| answers with timestamps | working ([@recap](https://github.com/tinkrland/prixie.ai/tree/recap)) | h:mm:ss citations back into the transcript, never a summary standing in for the source; [@recap](https://github.com/tinkrland/prixie.ai/tree/recap) owns that surface |
| the questions you asked her to ask | working | the answer to each prepared CaptureRequest question, quoted from the room |
| attendance receipts | working | the message text, sent_at, sent_status, and trigger for every attendance mark, plus form fills |
| codes and access info | working | term_detector's take-home terms (hackathon access codes, join info) relayed verbatim, never paraphrased |
| screenshots | working | captured on request, stored, linked in the take-home |
| summaries | working (only when asked) | a summary is never sent unless the owner specifically asked for one: the default take-home is the transcript, the answers, and the receipts. no unrequested summaries |

## form platforms she can fill

which form engines she can in fact fill out (the owner asked, oct 22 2026).
the fill engine (form_entry.enterForm) is engine-agnostic: it walks
standard dom selectors, types her identity, aligns newsletter boxes,
refuses cc fields, and clicks one submit. that is the whole machine,
so the honest answer per platform is about page structure, not brand:

| platform | status | notes |
| --- | --- | --- |
| google forms | working (verified) | the only one live-proven: the attendance flow runs on it end to end (theurltell + safety gate, form email identity, cc hard stop, submit receipt) |
| tally.so | working in principle (structure verified, never live-filled) | a published tally inspected oct 22 2026: real dom radio inputs and a real submit button, whole form on one page. no advance step needed, so the generic fill applies as is |
| jotform | presumed yes | classic form engine, standard inputs and submit buttons; structure not inspected, never live-filled |
| fillout | presumed yes | published forms (form.fillout.com) are react pages with standard inputs; structure not inspected, never live-filled |
| airtable forms | presumed yes | one-page share forms with standard inputs; structure not inspected, never live-filled |
| microsoft forms | needs a probe first | the standalone ResponsePage renders custom question widgets and embedded office forms come in iframes; neither inspected nor live-filled. no claim until a live one is probed |
| surveymonkey | working in principle (advance step built, never live-filled) | the flow loop (oct 22 2026): fill the screen, click next until a submit-shaped button, max 15 screens, newsletter + cc rules ride every screen. reCAPTCHA on free plans can still stop her cold, and that would be told, not hidden |
| typeform | working in principle (advance step built, never live-filled) | same flow loop: one question per screen, the arrow button carries "next" in aria-label which the click matcher reads, submit-shaped wins over next-shaped. the homepage demos are marketing mockups (checked oct 22 2026); a real typeform link is the first verified row upgrade |

or simply put: single-page standard-dom forms (google forms verified,
tally structure-verified, jotform / fillout / airtable presumed) are
hers. one-screen-at-a-time engines (typeform, surveymonkey) need a
per-screen advance step that is not built. microsoft forms is not
claimed until a live form is probed. every "presumed" row becomes
"working (verified)" the first time a real link of that engine is
filled, and not before.

## unsuccessful attempts

what she does when the answer is no. she does not give up silently
and she never fakes success: she asks again, or asks someone, and the
receipt says exactly what happened.

| situation | status | what she does | notes |
| --- | --- | --- | --- |
| the waiting room never answers | working | she asks again on a bounded cadence (the mods-missed-a-popup badger), every ask counted on the result; still ignored is waiting_room, not failed | awaitEntry in browserbase.ts |
| the join attempt fails | partial | the failure is recorded honestly (status failed, the reason kept); the waiting-room ask is the built re-request, a retry ladder for failed joins is planned | one deploy attempt per meeting today, and duplicate deployment is closed (pre-deploy claim + stale-claim sweep); a retry ladder for failed joins is planned |
| a shared file she cannot open | working | doc_access: she reads the access state in a side session, tries the request-access flow, and asks the host in the chat by name; one attempt per link per meeting | never assumed open, never assumed requested |
| a promo code with no straightforward place to apply it, when she has been told it is time-bound / limited keys | planned | she asks in the chat: "wait can someone confirm if i need my card on file for this? i dont have it on me at the moment lol" | the honest hedge: sometimes a promo works without a card, and asking beats a blind checkout. the redeem flow today extracts codes (capture-gated) and applies them only outside cc flows; this ask is the next branch of it |

## improved understanding

the reading that makes the transcript more than text.

| ability | status | notes |
| --- | --- | --- |
| persona context | designed | one retelldb persona memory across all surfaces ([@context](https://github.com/tinkrland/prixie.ai/tree/context) owns it); the proxy reads her identity and register from it, never a blank slate |
| technical term detection | working | term_detector pulls codes, access info, and jargon from the live text verbatim; assembly.ai custom vocabulary for technical jargon is the next step (configured per environment) |
| multilingual: hinglish transliteration | working | hinglish renders latin script, phonetically written, italics on the hinglish portion, devanagari never in the take-home |
| multi-speaker transcript parsing | working | assembly.ai diarization (speaker_labels), utterances speaker-tagged end to end: capture keyword hits carry the speaker, host reads carry the name |
| screenshare, call voice, and chat treated hand in hand | working | chat and spoken prompts count equally in the q&a flow (her permission ask answers either), the voice agent pauses through screen-share setup silence, and the chat monitor runs beside the transcript | reading the share's contents is a later step (planned) |

## on the horizon

not promises, direction (the owner, oct 22 2026). entries wait until they are built.

| horizon | notes |
| --- | --- |
| voice: her own phone number | she joins conference calls, regular calls, facetime (audio and video) and whatsapp calls. first pass on an easier service for audio/video calls, then sip trunking, with the SAME number across platforms. the docket branch keeps the phone legs as watches |
| context across calls | she retains context over a period of multiple calls: what she heard and said in one call carries into the next |
| wallet / identity rails | clawbank, agentcard or similar: her own payment and identity rails, so she can transact as herself |
| her own cloud vm | the on-demand microvm stops being a per-call spawn and becomes a dedicated cloud virtual machine (still on-demand in spirit, hers in fact) |
| her own password manager | a 1password / bitwarden style vault that is HERS, not the owner's: she holds credentials as herself, never borrows the owner's |
| vtuber-esque features | the proskena room + masky face go full vtuber: expressive presence beyond the meeting cam box |
| multilingual coverage | speech-to-speech and transcript coverage beyond english (hinglish transliteration already keeps latin script) |
| book a meeting with her | people can book time with prixie herself |
| she hosts meetings | from attendee to host: her room, her invite, her rules |

| an oss join engine | a self-hosted alternative to the browserbase subscription, for people who want no dependency on it (the owner, oct 22 2026). the swap is an engine, not a rewrite: everything above browserbase.ts talks cdpExecute and findAndType, not browserbase. the candidates below were read from their repos and docs oct 22 2026, none built. decided oct 23 2026: browserbase stays for now; the row keeps for the people who will want the swap. kernel.sh (oct 25 2026) is the one to keep compatible at the seam: same cdp wire, captcha solving on the other end |

the four candidates the owner named (oct 22 2026), each judged against
the one thing that matters for the swap, the cdp seam:

- **browserstation** (github.com/reinforcenow/browserstation, mit, ~160 stars): says it outright, "an open-source alternative to browserbase". ray + kubernetes under it (helm, kind, worker pods with a chrome sidecar), and a fastapi websocket proxy that streams raw cdp. seam fit: native, cdp is its tongue. honest cost: the k8s weight of the whole cluster, and session persistence and stealth are still on its roadmap, so it is infra more than it is stealth.
- **steel.dev** (steel-browser, self-hosting guide published): a browser api over chromium, sessions with stealth flags, cdp included. seam fit: good, cdp sessions are first class. one docker to run, lighter than a cluster.
- **browserless.io** (self-hosted docker): the veteran. v2 is the maintained line (v1 gets security fixes only), puppeteer / playwright / cdp endpoints, concurrency and queue limits set by env var. honest limits: chrome and edge images are amd64 only (arm64 ships chromium), and it is the least bot-aware of the four.
- **camofox-browser** (github.com/jo-inc/camofox-browser, over camoufox): the stealth pick. anti-detect firefox with c++-level fingerprint spoofing, drop-in puppeteer/playwright replacement, built for the sites that block the others. honest limit: firefox is not cdp, so cdpExecute needs an adapter there, not a url swap.
- **kernel.sh** (onkernel.com, oss core = kernel/kernel-images, apache 2.0, go, ~1.1k stars, over the hypeman microvm runtime): the compatibility alternative the owner asked to keep (oct 25 2026). the browser object carries cdp_ws_url natively (read from their openapi spec, and an api key verified live oct 25 2026: browser list 200), so the seam is the same three moves: create browser, connect the cdp websocket, talk. unlike the four above it also solves captchas and manages proxies (stealth mode), which makes it the feature-parity pick. the honest limit: hosted at onkernel.com it is still a subscription; the self-host escape hatch is kernel-images itself, a go service over microvms, heavier than steel's one docker.

the trade that stays true across all four: she keeps the join flows,
the flow loop, and the tell; browserbase's captcha solving and
verified fingerprints go, so the harder sites get harder. camofox is
the hedge built for exactly that. discussion, nothing built.
