-- RALLY: Notification Center — templates, versioning, and admin RPCs
-- Migration 00033

-- ============================================================
-- 1. NOTIFICATION TEMPLATES
-- ============================================================

CREATE TABLE notification_templates (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug             TEXT UNIQUE NOT NULL,
    category         TEXT NOT NULL,
    channels         TEXT[] NOT NULL,
    title_template   TEXT NOT NULL,
    body_template    TEXT NOT NULL,
    title_char_limit INT DEFAULT 50,
    body_char_limit  INT DEFAULT 160,
    variables        JSONB NOT NULL DEFAULT '[]',
    is_active        BOOLEAN DEFAULT true,
    status           TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published')),
    version          INT DEFAULT 1,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now(),
    updated_by       UUID REFERENCES admin_users(id)
);

-- ============================================================
-- 2. NOTIFICATION TEMPLATE VERSIONS
-- ============================================================

CREATE TABLE notification_template_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES notification_templates(id) ON DELETE CASCADE,
    version         INT NOT NULL,
    title_template  TEXT NOT NULL,
    body_template   TEXT NOT NULL,
    channels        TEXT[] NOT NULL,
    is_active       BOOLEAN NOT NULL,
    status          TEXT NOT NULL,
    changed_by      UUID NOT NULL REFERENCES admin_users(id),
    changed_at      TIMESTAMPTZ DEFAULT now(),
    change_note     TEXT
);

CREATE INDEX idx_template_versions_template_version
    ON notification_template_versions(template_id, version);

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read notification_templates"
    ON notification_templates FOR SELECT USING (is_admin());

CREATE POLICY "Admins read notification_template_versions"
    ON notification_template_versions FOR SELECT USING (is_admin());

-- ============================================================
-- 4. UPDATED_AT TRIGGER
-- ============================================================

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. SEED TEMPLATES
-- ============================================================

INSERT INTO notification_templates (slug, category, channels, title_template, body_template, variables) VALUES
(
    'tournament_reminder',
    'tournament',
    '{push,sms}',
    'Reminder: {{tournament_name}}',
    '{{tournament_name}} is coming up! {{location_city}}',
    '["tournament_name","location_city"]'
),
(
    'rsvp_request',
    'guest',
    '{sms}',
    'RSVP: {{tournament_name}}',
    'Are you coming to {{tournament_name}} ({{location_city}})? Reply YES, NO, or MAYBE.',
    '["tournament_name","location_city"]'
),
(
    'cancellation_deadline',
    'travel',
    '{push}',
    'Cancellation Deadline',
    '{{hotel_name}} for {{tournament_name}} — cancel by {{deadline}} for a full refund.',
    '["hotel_name","tournament_name","deadline"]'
),
(
    'schedule_change',
    'email',
    '{push}',
    'Schedule Change Detected',
    'Schedule update from {{sender}}: "{{subject}}"',
    '["sender","subject"]'
),
(
    'hotel_booking_detected',
    'email',
    '{push}',
    'Hotel Booking Detected',
    'New stay and play email from {{sender}}: "{{subject}}"',
    '["sender","subject"]'
),
(
    'travel_confirmation_detected',
    'email',
    '{push}',
    'Travel Confirmation Detected',
    'New travel confirmation from {{sender}}: "{{subject}}"',
    '["sender","subject"]'
),
(
    'coach_announcement',
    'email',
    '{push}',
    'Coach Announcement',
    '{{summary}}',
    '["summary","subject"]'
),
(
    'schedule_posted',
    'tournament',
    '{push}',
    'Schedule Posted: {{tournament_name}}',
    'The schedule for {{tournament_name}} should be available now! Check your schedule link or AES for pool assignments.',
    '["tournament_name"]'
),
(
    'tickets_on_sale',
    'tournament',
    '{push}',
    'Tickets On Sale: {{tournament_name}}',
    'Tickets for {{tournament_name}} should be on sale now! Don''t forget to buy before they sell out.',
    '["tournament_name"]'
);

-- ============================================================
-- 6. ADMIN RPCs
-- ============================================================

-- 6a) List notification templates with optional filters and version count
CREATE OR REPLACE FUNCTION admin_list_notification_templates(
    channel_filter  TEXT DEFAULT NULL,
    category_filter TEXT DEFAULT NULL,
    status_filter   TEXT DEFAULT NULL,
    page_size       INT DEFAULT 50,
    page_offset     INT DEFAULT 0
)
RETURNS TABLE (
    id               UUID,
    slug             TEXT,
    category         TEXT,
    channels         TEXT[],
    title_template   TEXT,
    body_template    TEXT,
    title_char_limit INT,
    body_char_limit  INT,
    variables        JSONB,
    is_active        BOOLEAN,
    status           TEXT,
    version          INT,
    created_at       TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ,
    updated_by       UUID,
    version_count    BIGINT
)
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        nt.id, nt.slug, nt.category, nt.channels,
        nt.title_template, nt.body_template,
        nt.title_char_limit, nt.body_char_limit,
        nt.variables, nt.is_active, nt.status, nt.version,
        nt.created_at, nt.updated_at, nt.updated_by,
        (SELECT count(*) FROM notification_template_versions v WHERE v.template_id = nt.id) AS version_count
    FROM notification_templates nt
    WHERE (channel_filter IS NULL OR nt.channels && ARRAY[channel_filter])
      AND (category_filter IS NULL OR nt.category = category_filter)
      AND (status_filter IS NULL OR nt.status = status_filter)
    ORDER BY nt.created_at ASC
    LIMIT page_size OFFSET page_offset;
$$;

REVOKE ALL ON FUNCTION admin_list_notification_templates(TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_notification_templates(TEXT, TEXT, TEXT, INT, INT) TO authenticated;

-- 6b) Get a single notification template
CREATE OR REPLACE FUNCTION admin_get_notification_template(template_id UUID)
RETURNS TABLE (
    id               UUID,
    slug             TEXT,
    category         TEXT,
    channels         TEXT[],
    title_template   TEXT,
    body_template    TEXT,
    title_char_limit INT,
    body_char_limit  INT,
    variables        JSONB,
    is_active        BOOLEAN,
    status           TEXT,
    version          INT,
    created_at       TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ,
    updated_by       UUID
)
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        nt.id, nt.slug, nt.category, nt.channels,
        nt.title_template, nt.body_template,
        nt.title_char_limit, nt.body_char_limit,
        nt.variables, nt.is_active, nt.status, nt.version,
        nt.created_at, nt.updated_at, nt.updated_by
    FROM notification_templates nt
    WHERE nt.id = template_id;
$$;

REVOKE ALL ON FUNCTION admin_get_notification_template(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_notification_template(UUID) TO authenticated;

-- 6c) Update a notification template (archives old version first)
CREATE OR REPLACE FUNCTION admin_update_notification_template(
    p_template_id  UUID,
    new_title      TEXT,
    new_body       TEXT,
    new_is_active  BOOLEAN,
    new_status     TEXT,
    admin_id       UUID,
    change_note    TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    old_record notification_templates%ROWTYPE;
BEGIN
    -- Fetch current state
    SELECT * INTO old_record FROM notification_templates WHERE id = p_template_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found: %', p_template_id;
    END IF;

    -- Archive current version
    INSERT INTO notification_template_versions (
        template_id, version, title_template, body_template,
        channels, is_active, status, changed_by, change_note
    ) VALUES (
        old_record.id, old_record.version, old_record.title_template, old_record.body_template,
        old_record.channels, old_record.is_active, old_record.status, admin_id, change_note
    );

    -- Update template with new values and bump version
    UPDATE notification_templates SET
        title_template = new_title,
        body_template  = new_body,
        is_active      = new_is_active,
        status         = new_status,
        version        = old_record.version + 1,
        updated_by     = admin_id
    WHERE id = p_template_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_update_notification_template(UUID, TEXT, TEXT, BOOLEAN, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_notification_template(UUID, TEXT, TEXT, BOOLEAN, TEXT, UUID, TEXT) TO authenticated;

-- 6d) Revert a notification template to a prior version
CREATE OR REPLACE FUNCTION admin_revert_notification_template(
    p_template_id  UUID,
    target_version INT,
    admin_id       UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    current_record notification_templates%ROWTYPE;
    old_version    notification_template_versions%ROWTYPE;
BEGIN
    -- Fetch current state
    SELECT * INTO current_record FROM notification_templates WHERE id = p_template_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found: %', p_template_id;
    END IF;

    -- Fetch the target version
    SELECT * INTO old_version
    FROM notification_template_versions
    WHERE template_id = p_template_id AND version = target_version;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Version % not found for template %', target_version, p_template_id;
    END IF;

    -- Archive current state before reverting
    INSERT INTO notification_template_versions (
        template_id, version, title_template, body_template,
        channels, is_active, status, changed_by, change_note
    ) VALUES (
        current_record.id, current_record.version, current_record.title_template, current_record.body_template,
        current_record.channels, current_record.is_active, current_record.status, admin_id,
        'Reverted to version ' || target_version
    );

    -- Apply the old version values and bump version counter
    UPDATE notification_templates SET
        title_template = old_version.title_template,
        body_template  = old_version.body_template,
        channels       = old_version.channels,
        is_active      = old_version.is_active,
        status         = old_version.status,
        version        = current_record.version + 1,
        updated_by     = admin_id
    WHERE id = p_template_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_revert_notification_template(UUID, INT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_revert_notification_template(UUID, INT, UUID) TO authenticated;

-- 6e) List version history for a template
CREATE OR REPLACE FUNCTION admin_list_template_versions(p_template_id UUID)
RETURNS TABLE (
    id             UUID,
    template_id    UUID,
    version        INT,
    title_template TEXT,
    body_template  TEXT,
    channels       TEXT[],
    is_active      BOOLEAN,
    status         TEXT,
    changed_by     UUID,
    changed_at     TIMESTAMPTZ,
    change_note    TEXT
)
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        v.id, v.template_id, v.version,
        v.title_template, v.body_template,
        v.channels, v.is_active, v.status,
        v.changed_by, v.changed_at, v.change_note
    FROM notification_template_versions v
    WHERE v.template_id = p_template_id
    ORDER BY v.version DESC;
$$;

REVOKE ALL ON FUNCTION admin_list_template_versions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_template_versions(UUID) TO authenticated;

-- 6f) List delivery log from notification_log, joining auth.users for email
CREATE OR REPLACE FUNCTION admin_list_delivery_log(
    channel_filter  TEXT DEFAULT NULL,
    type_filter     TEXT DEFAULT NULL,
    status_filter   TEXT DEFAULT NULL,
    date_from       TIMESTAMPTZ DEFAULT NULL,
    date_to         TIMESTAMPTZ DEFAULT NULL,
    page_size       INT DEFAULT 50,
    page_offset     INT DEFAULT 0
)
RETURNS TABLE (
    id                UUID,
    user_id           UUID,
    user_email        TEXT,
    tournament_id     UUID,
    notification_type TEXT,
    channel           TEXT,
    message           TEXT,
    status            TEXT,
    sent_at           TIMESTAMPTZ,
    delivered_at      TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT
        nl.id,
        nl.user_id,
        u.email::TEXT AS user_email,
        nl.tournament_id,
        nl.notification_type,
        nl.channel,
        nl.message,
        nl.status,
        nl.sent_at,
        nl.delivered_at
    FROM notification_log nl
    LEFT JOIN auth.users u ON u.id = nl.user_id
    WHERE (channel_filter IS NULL OR nl.channel = channel_filter)
      AND (type_filter IS NULL OR nl.notification_type = type_filter)
      AND (status_filter IS NULL OR nl.status = status_filter)
      AND (date_from IS NULL OR nl.sent_at >= date_from)
      AND (date_to IS NULL OR nl.sent_at <= date_to)
    ORDER BY nl.sent_at DESC
    LIMIT page_size OFFSET page_offset;
$$;

REVOKE ALL ON FUNCTION admin_list_delivery_log(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_delivery_log(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO authenticated;
