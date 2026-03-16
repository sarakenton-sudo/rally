-- Match email footer to rally-hub.com website footer (dark navy, two-column)

UPDATE email_templates SET html_body = REPLACE(
  html_body,
  '<tr>
            <td style="padding:28px 32px;background-color:#EFF6FF;text-align:center;">
              <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                <img src="https://rally-hub.com/rallyhub_lockup_light.png" alt="RallyHUB" style="height:54px;width:auto;display:inline-block;margin-bottom:12px;" />
              </a>
              <p style="margin:0 0 16px;color:#1E3A5F;font-size:13px;font-weight:600;">
                Built by club parents, for club parents.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:left;vertical-align:middle;">
                    <a href="mailto:hello@rally-hub.com" style="color:#1E3A5F;font-size:14px;font-weight:600;text-decoration:none;white-space:nowrap;">hello@rally-hub.com</a>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                    <a href="https://rally-hub.com" style="color:#4A6B8A;font-size:12px;text-decoration:underline;margin-right:12px;">Home</a>
                    <a href="https://rally-hub.com/app" style="color:#4A6B8A;font-size:12px;text-decoration:underline;">Sign Up</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>',
  '<tr>
            <td style="padding:32px;background-color:#1E3A5F;border-radius:0 0 16px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;text-align:left;padding-right:16px;">
                    <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                      <img src="https://rally-hub.com/rallyhub_lockup_white.png" alt="RallyHUB" style="height:48px;width:auto;display:block;margin-bottom:10px;" />
                    </a>
                    <p style="margin:0;color:rgba(255,255,255,0.5);font-size:13px;font-weight:700;">
                      Built by club parents, for club parents.
                    </p>
                  </td>
                  <td style="vertical-align:top;text-align:right;">
                    <p style="margin:0 0 6px;color:rgba(255,255,255,0.4);font-size:12px;line-height:1.8;">
                      &copy; 2026 Quiet Standard Consulting LLC
                    </p>
                    <p style="margin:0 0 6px;">
                      <a href="https://rally-hub.com/terms" style="color:rgba(255,255,255,0.5);font-size:12px;text-decoration:none;">Terms of Use</a>
                      <span style="color:rgba(255,255,255,0.3);margin:0 4px;">&middot;</span>
                      <a href="https://rally-hub.com/privacy" style="color:rgba(255,255,255,0.5);font-size:12px;text-decoration:none;">Privacy Policy</a>
                    </p>
                    <p style="margin:0;">
                      <a href="mailto:hello@rally-hub.com" style="color:rgba(255,255,255,0.5);font-size:12px;text-decoration:none;">hello@rally-hub.com</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>'
), updated_at = now();
