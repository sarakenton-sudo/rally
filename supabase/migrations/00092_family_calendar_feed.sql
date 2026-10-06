-- Family calendar feed: one private, unguessable link per family that Google
-- or Apple Calendar subscribes to (tournaments + games), and that updates itself.
CREATE TABLE IF NOT EXISTS family_calendar_feeds (
    admin_config_id UUID PRIMARY KEY REFERENCES admin_config(id) ON DELETE CASCADE,
    token           UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE family_calendar_feeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON family_calendar_feeds FROM anon, authenticated;

-- The caller's family config: their own, or (co-parent) the primary parent's.
CREATE OR REPLACE FUNCTION my_family_config_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id FROM admin_config WHERE user_id = auth.uid()
    UNION ALL
    SELECT ac.id FROM admin_config ac
     WHERE ac.user_id IN (SELECT DISTINCT p.admin_id FROM admin_athletes p
                           JOIN admin_athletes me ON me.athlete_id = p.athlete_id
                           WHERE me.admin_id = auth.uid() AND p.is_primary = true)
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_family_calendar_token()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cfg UUID := my_family_config_id(); v_tok UUID;
BEGIN
    IF v_cfg IS NULL THEN RAISE EXCEPTION 'family not found'; END IF;
    INSERT INTO family_calendar_feeds (admin_config_id) VALUES (v_cfg) ON CONFLICT (admin_config_id) DO NOTHING;
    SELECT token INTO v_tok FROM family_calendar_feeds WHERE admin_config_id = v_cfg;
    RETURN v_tok;
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_family_calendar_token() TO authenticated;
