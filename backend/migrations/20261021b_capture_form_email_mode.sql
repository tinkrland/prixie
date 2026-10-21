-- capture requests learn form_email_mode: which of her four form-email
-- strategies enters the form (regular / plus / disposable / business).
-- null = her default, which is plus (same inbox, per-service trace).
-- no addresses are stored in the repo or the db: they live in env.
alter table capture_requests add column if not exists form_email_mode text;
