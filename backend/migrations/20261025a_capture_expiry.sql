-- the owner, oct 25 2026: "can prixie note the urgency of the code expiring
-- from the words being said?" yes: extractExpiryWindow reads the words
-- around a capture and stores what was SAID, never a guess. the four
-- columns are nullable on purpose: no expiry-shaped sentence heard is
-- the common case and a fine answer.

ALTER TABLE public.capture_requests
    ADD COLUMN IF NOT EXISTS expiry_kind TEXT,      -- minutes | clock | meeting_end | today | hurry
    ADD COLUMN IF NOT EXISTS expiry_minutes INT,    -- normalized window estimate, only when computable
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ, -- ISO, only when the words carry one
    ADD COLUMN IF NOT EXISTS expiry_quote TEXT;     -- the words that said it, for showing our work
