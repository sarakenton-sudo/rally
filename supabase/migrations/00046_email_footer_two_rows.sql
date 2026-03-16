-- Footer: centered logo + tagline on top, hello@ left / terms right below

UPDATE email_templates SET html_body = REPLACE(
  html_body,
  '<td style="vertical-align:top;text-align:left;padding-right:16px;">
                    <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                      <img src="https://rally-hub.com/rallyhub_lockup_white.png" alt="RallyHUB" style="height:48px;width:auto;display:block;margin-bottom:10px;" />
                    </a>
                    <p style="margin:0;color:rgba(255,255,255,0.5);font-size:13px;font-weight:700;white-space:nowrap;">
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
                  </td>
                </tr>
              </table>',
  '<td colspan="2" style="text-align:center;">
                    <a href="https://rally-hub.com" target="_blank" style="text-decoration:none;">
                      <img src="https://rally-hub.com/rallyhub_lockup_white.png" alt="RallyHUB" style="height:48px;width:auto;display:inline-block;margin-bottom:10px;" />
                    </a>
                    <p style="margin:0 0 16px;color:rgba(255,255,255,0.5);font-size:13px;font-weight:700;">
                      Built by club parents, for club parents.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="text-align:left;">
                    <a href="mailto:hello@rally-hub.com" style="color:rgba(255,255,255,0.5);font-size:12px;text-decoration:none;">hello@rally-hub.com</a>
                  </td>
                  <td style="text-align:right;">
                    <a href="https://rally-hub.com/terms" style="color:rgba(255,255,255,0.4);font-size:11px;text-decoration:none;">Terms of Use</a>
                    <span style="color:rgba(255,255,255,0.25);margin:0 4px;">&middot;</span>
                    <a href="https://rally-hub.com/privacy" style="color:rgba(255,255,255,0.4);font-size:11px;text-decoration:none;">Privacy Policy</a>
                  </td>
                </tr>
              </table>'
), updated_at = now();
