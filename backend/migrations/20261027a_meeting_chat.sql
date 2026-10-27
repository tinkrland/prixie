-- the chat as a take-home artifact (the owner, oct 27 2026): every chat line
-- is persisted as it arrives; the transcript gains a chat_log column so
-- the take-home carries the typed conversation alongside the spoken one.
CREATE TABLE IF NOT EXISTS public.meeting_chat_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    speaker TEXT NOT NULL,
    message TEXT NOT NULL,
    -- 'chat' = someone typed it; 'chat_sent' = her own send
    source TEXT NOT NULL DEFAULT 'chat',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_chat_lines_meeting
    ON public.meeting_chat_lines(meeting_id, created_at);

ALTER TABLE public.transcripts ADD COLUMN IF NOT EXISTS chat_log TEXT;
