-- ============================================================
-- Email templates (editable from admin panel)
-- ============================================================

CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    variables JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES admin_users(id)
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read all email templates" ON email_templates FOR SELECT USING (is_admin());
CREATE POLICY "Admins update email templates" ON email_templates FOR UPDATE USING (is_admin());

-- Seed the 3 existing templates

INSERT INTO email_templates (slug, name, subject, html_body, variables) VALUES
(
  'referral_invite',
  'Referral Invite',
  'You''ve been invited to RALLY!',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(30,58,95,0.06);">
          <tr>
            <td style="background-color:#3B82B0;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:28px;font-weight:800;letter-spacing:1px;">RALLY</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#1E3A5F;font-size:22px;font-weight:700;">
                You''ve been invited to RALLY!
              </h2>
              <p style="margin:0 0 16px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                <strong>{{referrer_name}}</strong> thinks you''d love RALLY — the volleyball family hub that keeps your tournament season organized.
              </p>
              <p style="margin:0 0 24px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                Track tournaments, manage travel bookings, coordinate with family — all in one place. No more digging through emails and group chats.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://rally-hub.com" target="_blank" style="display:inline-block;background-color:#3B82B0;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Get Started with RALLY
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E8E2D8;text-align:center;">
              <p style="margin:0;color:#8FA8BF;font-size:12px;">
                RALLY by Quiet Standard LLC
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  '["referrer_name"]'::JSONB
),
(
  'coparent_invite',
  'Co-Parent Invite',
  'You''ve been invited to join RALLY!',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(30,58,95,0.06);">
          <tr>
            <td style="background-color:#3B82B0;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:28px;font-weight:800;letter-spacing:1px;">RALLY</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#1E3A5F;font-size:22px;font-weight:700;">
                You''ve been invited to join RALLY!
              </h2>
              <p style="margin:0 0 16px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                <strong>{{referrer_name}}</strong> has invited you to share access on RALLY — the volleyball family hub that keeps your tournament season organized.
              </p>
              <p style="margin:0 0 8px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                Your invite code:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background-color:#EFF6FF;border:2px solid #3B82B0;border-radius:12px;padding:16px 32px;">
                      <span style="font-size:28px;font-weight:800;color:#3B82B0;letter-spacing:4px;font-family:''Courier New'',monospace;">
                        {{invite_code}}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;color:#4A6B8A;font-size:14px;line-height:1.6;">
                Sign up at rally-hub.com, then enter the code above to link your account.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://rally-hub.com" target="_blank" style="display:inline-block;background-color:#3B82B0;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Join RALLY
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E8E2D8;text-align:center;">
              <p style="margin:0;color:#8FA8BF;font-size:12px;">
                RALLY by Quiet Standard LLC
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  '["referrer_name", "invite_code"]'::JSONB
),
(
  'athlete_invite',
  'Athlete Invite',
  'You''ve been added to RALLY!',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F3EE;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(30,58,95,0.06);">
          <tr>
            <td style="background-color:#3B82B0;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:28px;font-weight:800;letter-spacing:1px;">RALLY</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#1E3A5F;font-size:22px;font-weight:700;">
                You''ve been added to RALLY!
              </h2>
              <p style="margin:0 0 16px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                <strong>{{referrer_name}}</strong> added you to RALLY so you can see your tournament schedule, team info, and travel details all in one place.
              </p>
              <p style="margin:0 0 8px;color:#4A6B8A;font-size:15px;line-height:1.6;">
                Your invite code:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background-color:#EFF6FF;border:2px solid #3B82B0;border-radius:12px;padding:16px 32px;">
                      <span style="font-size:28px;font-weight:800;color:#3B82B0;letter-spacing:4px;font-family:''Courier New'',monospace;">
                        {{invite_code}}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;color:#4A6B8A;font-size:14px;line-height:1.6;">
                Sign up at rally-hub.com and enter the code above to get started.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://rally-hub.com" target="_blank" style="display:inline-block;background-color:#3B82B0;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Join RALLY
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #E8E2D8;text-align:center;">
              <p style="margin:0;color:#8FA8BF;font-size:12px;">
                RALLY by Quiet Standard LLC
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  '["referrer_name", "invite_code"]'::JSONB
);

-- RPCs for admin

CREATE OR REPLACE FUNCTION admin_list_email_templates()
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  subject TEXT,
  variables JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, slug, name, subject, variables, updated_at
  FROM email_templates
  ORDER BY name ASC;
$$;

CREATE OR REPLACE FUNCTION admin_get_email_template(template_id UUID)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  subject TEXT,
  html_body TEXT,
  variables JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, slug, name, subject, html_body, variables, updated_at
  FROM email_templates
  WHERE id = template_id;
$$;

CREATE OR REPLACE FUNCTION admin_update_email_template(
  template_id UUID,
  new_subject TEXT,
  new_html_body TEXT,
  admin_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE email_templates
  SET subject = new_subject,
      html_body = new_html_body,
      updated_at = now(),
      updated_by = admin_id
  WHERE id = template_id;
END;
$$;
