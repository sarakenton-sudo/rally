-- Gmail OAuth integration: token storage, team_config updates, forwarded_emails source tracking

-- ============================================================
-- New table: gmail_tokens (service_role only, no RLS)
-- ============================================================
CREATE TABLE gmail_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  gmail_email TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_history_id TEXT,
  sync_errors INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT gmail_tokens_user_id_unique UNIQUE (user_id)
);

-- No RLS — only service_role can access (tokens never exposed to client)
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;
-- No policies = no client access

-- Updated_at trigger
CREATE TRIGGER gmail_tokens_updated_at
  BEFORE UPDATE ON gmail_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Alter team_config: Gmail connection status (client-visible)
-- ============================================================
ALTER TABLE team_config
  ADD COLUMN gmail_connected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN gmail_email TEXT;

-- ============================================================
-- Alter forwarded_emails: source tracking + dedup
-- ============================================================
ALTER TABLE forwarded_emails
  ADD COLUMN source TEXT NOT NULL DEFAULT 'forward',
  ADD COLUMN gmail_message_id TEXT;

-- Unique index for Gmail dedup (null-safe — only enforces uniqueness on non-null values)
CREATE UNIQUE INDEX idx_forwarded_emails_gmail_message_id
  ON forwarded_emails (gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

-- ============================================================
-- pg_cron: schedule gmail-sync every 15 minutes
-- ============================================================
-- Note: pg_cron must be enabled in Supabase dashboard (Database → Extensions)
-- The cron job calls the gmail-sync edge function via pg_net
SELECT cron.schedule(
  'gmail-sync-cron',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/gmail-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
