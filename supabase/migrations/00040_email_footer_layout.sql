-- Update email template footers: larger logo, left-aligned logo+tagline, right-aligned links+email

-- Helper: new footer HTML block
-- Logo 36px → 108px (3x), left-justified logo+tagline, right-justified hello@ (2x bigger) and links

UPDATE email_templates SET html_body = REPLACE(
  html_body,
  '<tr>
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
          </tr>',
  '<tr>
            <td style="padding:28px 32px;background-color:#EFF6FF;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;text-align:left;">
                    <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                      <img src="https://rally-hub.com/rallyhub_lockup_light.png" alt="RallyHUB" style="height:108px;width:auto;display:block;margin-bottom:10px;" />
                    </a>
                    <p style="margin:0;color:#1E3A5F;font-size:13px;font-weight:600;">
                      Built by club parents, for club parents.
                    </p>
                  </td>
                  <td style="vertical-align:top;text-align:right;">
                    <p style="margin:0 0 8px;">
                      <a href="mailto:hello@rally-hub.com" style="color:#1E3A5F;font-size:16px;font-weight:600;text-decoration:none;">hello@rally-hub.com</a>
                    </p>
                    <p style="margin:0;">
                      <a href="https://rally-hub.com" style="color:#4A6B8A;font-size:12px;text-decoration:underline;margin-right:12px;">Home</a>
                      <a href="https://rally-hub.com/app" style="color:#4A6B8A;font-size:12px;text-decoration:underline;">Sign Up</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>'
), updated_at = now();
