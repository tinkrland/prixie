-- capture requests learn "redeem": when a link drops in chat for a
-- redeem-enabled request, prixie fills the form with the owner identity
-- herself instead of only notifying. run in the supabase sql editor.
alter table capture_requests add column if not exists redeem boolean default false;
