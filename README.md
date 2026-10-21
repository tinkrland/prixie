# recap

the after surface. you missed the session: you were asleep, or somewhere
without service, or you just did not have three hours. but there is a
recording, and someone sent you the link: an unlisted youtube url, a
private vod, a drive file. prixie watches it for you and brings back what
you actually needed, the same way she would have if she had been in the
room: not a summary of a few hours, the answers to the capture requests
you sent her with.

the pipeline, end to end:

1. **intake.** `classifySource(url)` + `buildFetchPlan(url)` (server/recap.ts).
   an unlisted youtube link is exactly the shape this branch exists for:
   unlisted means the link itself is the access, no login, no api
   privilege. yt-dlp handles youtube (listed or unlisted) and twitch vods;
   direct media urls download plainly.
2. **transcribe.** the same transcription the proxy already trusts:
   assembly.ai, speaker labels, with timestamps. the recording becomes a
   transcript document, not a video to rewatch.
3. **ingest.** the transcript goes into retelldb as a document for the
   persona (scripts/recap_ingest.py shells the retelldb cli: `ingest`,
   then `query`), so what was said becomes memory she can relate, weighted
   and timestamped, not a file in a drawer.
4. **answer.** your capture requests run against the transcript first
   (timestamps are the citations: "the access code, said at 1:12:45") and
   retelldb second (what it means, who said it, what it relates to). you
   wake up to answers, not recordings. again.

what this branch deliberately is not: a summarizer. a recap is capture
requests answered with citations, and the session ingested as memory. if
you wanted a summary you would not have sent prixie.

## what is in this branch

| path | what |
| --- | --- |
| `server/recap.ts` | classifySource, buildFetchPlan, buildTranscribePlan, RecapSession (ingest + answer), the default transports (yt-dlp fetch, assembly.ai transcribe, retelldb seam), and searchTranscript (the exact pass with h:mm:ss citations) |
| `scripts/recap_ingest.py` | the retelldb seam: ingest the transcript via the embedded sdk (the cli's --url is the remote server url, so the recording url rides in source_uri), query per capture request |
| `retelldb/`, `persona/` | byte-identical copies synced from the context branch (`sh tools/sync-context.sh`) |

## tests

```
deno test server/recap_test.ts
```
