-- Leads table for early access waitlist
CREATE TABLE leads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    phone           TEXT,
    marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
    status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'invited', 'signed_up')),
    source          TEXT DEFAULT 'website',
    invited_at      TIMESTAMPTZ,
    signed_up_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_status ON leads(status);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Public can submit (insert) a lead
CREATE POLICY "Anyone can submit a lead"
    ON leads FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Admin read access
CREATE POLICY "Admins can read leads"
    ON leads FOR SELECT
    USING (EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt()->>'email'));

-- Admin update access
CREATE POLICY "Admins can update leads"
    ON leads FOR UPDATE
    USING (EXISTS (SELECT 1 FROM admin_users WHERE email = auth.jwt()->>'email'));

-- Check lead status RPC (callable by anon for signup gating)
CREATE OR REPLACE FUNCTION check_lead_status(check_email TEXT)
RETURNS TABLE (status TEXT) AS $$
  SELECT status FROM leads WHERE email = lower(trim(check_email)) LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Auto-update lead on signup
CREATE OR REPLACE FUNCTION update_lead_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE leads
    SET status = 'signed_up', signed_up_at = now()
    WHERE email = lower(NEW.email) AND status = 'invited';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_lead_signup
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION update_lead_on_signup();

-- Seed invite email template (if email_templates table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_templates') THEN
    INSERT INTO email_templates (slug, name, subject, html_body) VALUES
    ('early_access_invite', 'Early Access Invite', 'You''re invited to RALLY! 🏐',
     '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2 style="color:#1E3A5F">You''re In! 🏐</h2><p>Great news — you''ve been invited to join <strong>RALLY</strong>, the volleyball family hub that keeps your tournament travel organized.</p><p><a href="https://rally-hub.com/auth?signup=true" style="display:inline-block;background:#3B82B0;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Create Your Account</a></p><p style="color:#8FA8BF;font-size:12px">Questions? Reply to this email or reach out at hello@rally-hub.com</p></div>')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
