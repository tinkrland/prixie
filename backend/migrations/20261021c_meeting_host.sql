-- the owner, oct 21 2026: who is running the room. she reads the
-- participant list after joining and records the host's display name.
-- null = she could not tell; roles are read honestly or not at all.

alter table meetings
  add column if not exists host_name text;

comment on column meetings.host_name is
  'display name of the meeting host as read from the participant list; null when the engine could not tell';

-- bookkeeping for the read itself: host_read stops the polling once
-- she has told (or honestly given up); host_retries counts the empty
-- reads before giving up (the list can populate late).
alter table meetings
  add column if not exists host_read boolean default false,
  add column if not exists host_retries integer default 0;
