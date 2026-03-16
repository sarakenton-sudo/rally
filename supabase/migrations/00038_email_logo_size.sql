-- Make logo 2.5x bigger in email headers (40px → 100px)
UPDATE email_templates
SET html_body = REPLACE(html_body, 'height:40px;width:auto;', 'height:100px;width:auto;'),
    updated_at = now();
