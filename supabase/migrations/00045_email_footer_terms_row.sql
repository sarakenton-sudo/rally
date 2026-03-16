-- Move terms/privacy to same row as tagline, right-justified

UPDATE email_templates SET html_body = REPLACE(
  html_body,
  '<p style="margin:0;color:rgba(255,255,255,0.5);font-size:13px;font-weight:700;white-space:nowrap;">
                      Built by club parents, for club parents.
                    </p>
                  </td>
                  <td style="vertical-align:middle;text-align:right;">
                    <p style="margin:0;">
                      <a href="mailto:hello@rally-hub.com" style="color:rgba(255,255,255,0.5);font-size:12px;text-decoration:none;">hello@rally-hub.com</a>
                    </p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="https://rally-hub.com/terms" style="color:rgba(255,255,255,0.4);font-size:11px;text-decoration:none;">Terms of Use</a>
                    <span style="color:rgba(255,255,255,0.25);margin:0 4px;">&middot;</span>
                    <a href="https://rally-hub.com/privacy" style="color:rgba(255,255,255,0.4);font-size:11px;text-decoration:none;">Privacy Policy</a>
                  </td>',
  '<p style="margin:0;color:rgba(255,255,255,0.5);font-size:13px;font-weight:700;white-space:nowrap;">
                      Built by club parents, for club parents.
                    </p>
                  </td>
                  <td style="vertical-align:top;text-align:right;">
                    <p style="margin:0 0 8px;">
                      <a href="mailto:hello@rally-hub.com" style="color:rgba(255,255,255,0.5);font-size:12px;text-decoration:none;">hello@rally-hub.com</a>
                    </p>
                    <p style="margin:0;">
                      <a href="https://rally-hub.com/terms" style="color:rgba(255,255,255,0.4);font-size:11px;text-decoration:none;">Terms of Use</a>
                      <span style="color:rgba(255,255,255,0.25);margin:0 4px;">&middot;</span>
                      <a href="https://rally-hub.com/privacy" style="color:rgba(255,255,255,0.4);font-size:11px;text-decoration:none;">Privacy Policy</a>
                    </p>
                  </td>'
), updated_at = now();
