# the docket

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

## how to read an entry

clicking this preview shows everything she needs for each watch:

- **what to fetch**: the capture requests. the things to watch for
  and bring back (codes, links, answers), exactly as instructed.
- **what to ask**: the questions she has been told to ask, out loud
  at the right moment or in the chat.
- **what to mark attendance**: how presence gets recorded for this
  one. usually a "present!" in the chat; sometimes a form, sometimes
  nothing at all.

entries marked `watching` are live. entries marked `passed` were
either attended or the window closed; the docket keeps the receipt
either way.

## the calendar

nothing is on the docket right now. this section regenerates from
the live meeting list every time `backend/scripts/docket.ts` runs
(it reads the token-gated proxy api, renders this file, and commits
it to this branch). an empty docket is an honest docket: no watch is
fabricated to fill the page.

when there are watches, they look like:

```
### [watching] hhs kickoff call
- when: thu 3ish pm eastern (approximate, as entered)
- platform: probably zoom (unconfirmed until the link lands)
- link: pending, watching slack / discord / huddle
- what to fetch: the access code they read out at the start
- what to ask: whether recordings get emailed afterwards
- what to mark attendance: chat message, "present!"
```

## regeneration

this branch is an orphan: it shares no history with the code. it
exists so that anyone (including prixie herself) can read her whole
docket from one preview. `backend/scripts/docket.ts` on main is the
only thing that writes here; nothing on this branch is hand-edited.

lowercase always. no dashes that em. patience is a feature.
