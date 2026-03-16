-- Update all email templates:
-- 1. Wrap header logo in link to rally-hub.com
-- 2. Replace simple footer with light blue footer (dark logo, tagline, links)

-- REFERRAL INVITE
UPDATE email_templates SET html_body = '<!DOCTYPE html>
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
            <td style="background-color:#1E3A5F;padding:28px 32px;text-align:center;">
              <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                <img src="https://rally-hub.com/rallyhub_lockup_white.png" alt="RallyHUB" style="height:100px;width:auto;" />
              </a>
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
                    <a href="https://rally-hub.com" target="_blank" style="display:inline-block;background-color:#1E3A5F;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Get Started with RALLY
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;background-color:#EFF6FF;text-align:center;">
              <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                <img src="https://rally-hub.com/rallyhub_lockup_light.png" alt="RallyHUB" style="height:36px;width:auto;margin-bottom:12px;" />
              </a>
              <p style="margin:0 0 12px;color:#1E3A5F;font-size:13px;font-weight:600;">
                Built by club parents, for club parents.
              </p>
              <p style="margin:0 0 8px;">
                <a href="mailto:hello@rally-hub.com" style="color:#4A6B8A;font-size:12px;text-decoration:none;">hello@rally-hub.com</a>
              </p>
              <p style="margin:0;">
                <a href="https://rally-hub.com" style="color:#4A6B8A;font-size:12px;text-decoration:underline;margin-right:16px;">Home</a>
                <a href="https://rally-hub.com/app" style="color:#4A6B8A;font-size:12px;text-decoration:underline;">Sign Up</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>', updated_at = now()
WHERE slug = 'referral_invite';

-- CO-PARENT INVITE
UPDATE email_templates SET html_body = '<!DOCTYPE html>
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
            <td style="background-color:#1E3A5F;padding:28px 32px;text-align:center;">
              <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                <img src="https://rally-hub.com/rallyhub_lockup_white.png" alt="RallyHUB" style="height:100px;width:auto;" />
              </a>
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
                    <div style="display:inline-block;background-color:#EFF6FF;border:2px solid #1E3A5F;border-radius:12px;padding:16px 32px;">
                      <span style="font-size:28px;font-weight:800;color:#1E3A5F;letter-spacing:4px;font-family:''Courier New'',monospace;">
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
                    <a href="https://rally-hub.com" target="_blank" style="display:inline-block;background-color:#1E3A5F;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Join RALLY
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;background-color:#EFF6FF;text-align:center;">
              <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                <img src="https://rally-hub.com/rallyhub_lockup_light.png" alt="RallyHUB" style="height:36px;width:auto;margin-bottom:12px;" />
              </a>
              <p style="margin:0 0 12px;color:#1E3A5F;font-size:13px;font-weight:600;">
                Built by club parents, for club parents.
              </p>
              <p style="margin:0 0 8px;">
                <a href="mailto:hello@rally-hub.com" style="color:#4A6B8A;font-size:12px;text-decoration:none;">hello@rally-hub.com</a>
              </p>
              <p style="margin:0;">
                <a href="https://rally-hub.com" style="color:#4A6B8A;font-size:12px;text-decoration:underline;margin-right:16px;">Home</a>
                <a href="https://rally-hub.com/app" style="color:#4A6B8A;font-size:12px;text-decoration:underline;">Sign Up</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>', updated_at = now()
WHERE slug = 'coparent_invite';

-- ATHLETE INVITE
UPDATE email_templates SET html_body = '<!DOCTYPE html>
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
            <td style="background-color:#1E3A5F;padding:28px 32px;text-align:center;">
              <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                <img src="https://rally-hub.com/rallyhub_lockup_white.png" alt="RallyHUB" style="height:100px;width:auto;" />
              </a>
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
                    <div style="display:inline-block;background-color:#EFF6FF;border:2px solid #1E3A5F;border-radius:12px;padding:16px 32px;">
                      <span style="font-size:28px;font-weight:800;color:#1E3A5F;letter-spacing:4px;font-family:''Courier New'',monospace;">
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
                    <a href="https://rally-hub.com" target="_blank" style="display:inline-block;background-color:#1E3A5F;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Join RALLY
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;background-color:#EFF6FF;text-align:center;">
              <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                <img src="https://rally-hub.com/rallyhub_lockup_light.png" alt="RallyHUB" style="height:36px;width:auto;margin-bottom:12px;" />
              </a>
              <p style="margin:0 0 12px;color:#1E3A5F;font-size:13px;font-weight:600;">
                Built by club parents, for club parents.
              </p>
              <p style="margin:0 0 8px;">
                <a href="mailto:hello@rally-hub.com" style="color:#4A6B8A;font-size:12px;text-decoration:none;">hello@rally-hub.com</a>
              </p>
              <p style="margin:0;">
                <a href="https://rally-hub.com" style="color:#4A6B8A;font-size:12px;text-decoration:underline;margin-right:16px;">Home</a>
                <a href="https://rally-hub.com/app" style="color:#4A6B8A;font-size:12px;text-decoration:underline;">Sign Up</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>', updated_at = now()
WHERE slug = 'athlete_invite';
