-- the owner, oct 22 2026: bot_deploying is the pre-deploy claim (one bot
-- per meeting). the claim sets the status BEFORE the join runs so
-- overlapping cycles or a second isolate can never deploy twice.
-- the live table's status check did not admit the value: every claim
-- failed the constraint and deployment was skipped entirely, so this
-- must run on the db before the proxy code that uses it.

alter table meetings
  drop constraint if exists meetings_status_check;

alter table meetings
  add constraint meetings_status_check check (status in (
    'scheduled', 'bot_deploying', 'bot_joining', 'bot_in_meeting',
    'completed', 'failed'
  ));
