-- Remove copyright line, make tagline nowrap

UPDATE email_templates SET html_body = REPLACE(
  html_body,
  '<p style="margin:0 0 6px;color:rgba(255,255,255,0.4);font-size:12px;line-height:1.8;">
                      &copy; 2026 Quiet Standard Consulting LLC
                    </p>
                    <p style="margin:0 0 6px;">',
  '<p style="margin:0 0 6px;">'
), updated_at = now();

UPDATE email_templates SET html_body = REPLACE(
  html_body,
  'margin:0;color:rgba(255,255,255,0.5);font-size:13px;font-weight:700;',
  'margin:0;color:rgba(255,255,255,0.5);font-size:13px;font-weight:700;white-space:nowrap;'
), updated_at = now();
