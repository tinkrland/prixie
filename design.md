# design: the recap branch

the premise: prixie is a proxy because you cannot be everywhere. recap is
the same premise one step later in time: you were not there, and there is
a recording. the branch's job is to make the recording equivalent to
having sent her, not equivalent to watching it.

## why not a summarizer

a summary of a three hour recording is three hours compressed, which is
still mostly noise. what you wanted from the session was specific: the
access code, the deadline, the answer to your question. the proxy already
has the shape for this: capture requests, asked before, answered after.
recap runs the same loop over a recording:

    link -> fetch -> transcribe -> ingest as memory -> answer capture requests

every step is one that already exists elsewhere in prixie, which is the
point: recap is a new surface over old bones.

## intake: the unlisted link is the token

unlisted youtube is the canonical case because it is a private recording
whose entire access model is "you have the link". no oauth dance, no api
privilege, no credentials to leak: `https://youtu.be/<id>`, held by
whoever was sent it. that maps exactly to a fetch plan:

- youtube (listed or unlisted) and twitch vods: yt-dlp, the link as the
  auth. unlisted is not a different protocol, only a different visibility.
- direct media (mp4, m4a, wav...): a plain download.
- anything else (drive, vimeo with restrictions, a login-gated platform):
  classified honestly and rejected with the reason, not fumbled. the
  browserbase join engine is the future route for anything a headless
  browser must be logged into to reach.

the plan is data until an executor runs it; the executor is the transport
and the transport throws, as everywhere else in prixie.

## transcription: the same ears

assembly.ai, with speaker labels and timestamps: the recording becomes a
transcript document identical in shape to the ones the proxy brings back
from meetings she attended live. every downstream step (ingest, answer)
works on that document and never on the video again.

## ingestion: the session becomes memory

the transcript is ingested into retelldb for the persona
(scripts/recap_ingest.py, which shells the retelldb cli): `retelldb ingest`
with the transcript as a markdown document, url and title attached. the
session's people, projects, decisions and codes become graph nodes like
any other knowledge, which is what makes the NEXT question about it
answerable without the recording at all.

## answers: capture requests with citations

each capture request runs twice:

1. **transcript search** (exact pass): keyword match over the timestamped
   segments, answer quoted from the segment, cited as h:mm:ss. what was
   said, where.
2. **retelldb query** (meaning pass): the routing engine over the ingested
   graph. what it means, who said it, what it relates to.

the exact pass answers "what was the access code"; the meaning pass answers
"what did they decide about the api timeline". both cite, and a question
neither pass can answer is reported as not found, not padded. gaps are
reported, not hidden: the rule the eval harness already enforces.

## what recap is not

not a summarizer, not a clip generator, not a video analysis stack. if
the answer needs the pixels, this branch says so and does not pretend.
