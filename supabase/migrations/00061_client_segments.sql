-- ============================================================
-- Coaching & Lessons Module — client segments + slot targeting (PR 5d)
-- A slot can be visible to: everyone (all connected clients), a single client,
-- or a named group/segment of clients. See PRD §7.5.
-- ============================================================

-- Named groups (segments) — coach-defined subsets of their roster.
CREATE TABLE IF NOT EXISTS client_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id    UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_groups_coach ON client_groups(coach_id);

CREATE TABLE IF NOT EXISTS client_group_members (
    group_id      UUID NOT NULL REFERENCES client_groups(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES coach_connections(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, connection_id)
);
CREATE INDEX IF NOT EXISTS idx_client_group_members_conn ON client_group_members(connection_id);

-- Slot targeting: add 'group' visibility + a group reference.
ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_visibility_check;
ALTER TABLE slots ADD CONSTRAINT slots_visibility_check CHECK (visibility IN ('all','individual','group'));
ALTER TABLE slots ADD COLUMN IF NOT EXISTS shared_with_group_id UUID REFERENCES client_groups(id) ON DELETE SET NULL;

-- ---- RLS ----
ALTER TABLE client_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Client groups managed by coach" ON client_groups;
CREATE POLICY "Client groups managed by coach"
    ON client_groups FOR ALL
    USING (coach_id = my_coach_id())
    WITH CHECK (coach_id = my_coach_id());

ALTER TABLE client_group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Group members managed by coach" ON client_group_members;
CREATE POLICY "Group members managed by coach"
    ON client_group_members FOR ALL
    USING (group_id IN (SELECT id FROM client_groups WHERE coach_id = my_coach_id()))
    WITH CHECK (group_id IN (SELECT id FROM client_groups WHERE coach_id = my_coach_id()));

-- Replace the slot read policy to include group-targeted slots.
DROP POLICY IF EXISTS "Slots read by coach or eligible parent" ON slots;
CREATE POLICY "Slots read by coach or eligible parent"
    ON slots FOR SELECT
    USING (
        coach_id = my_coach_id()
        OR (
            status = 'open' AND (
                (visibility = 'all' AND coach_id IN (SELECT my_connected_coach_ids()))
                OR (
                    visibility = 'individual'
                    AND shared_with_connection_id IN (
                        SELECT id FROM coach_connections WHERE parent_user_id = auth.uid()
                    )
                )
                OR (
                    visibility = 'group'
                    AND shared_with_group_id IN (
                        SELECT gm.group_id
                        FROM client_group_members gm
                        JOIN coach_connections cc ON cc.id = gm.connection_id
                        WHERE cc.parent_user_id = auth.uid()
                    )
                )
            )
        )
    );

-- Coach reads their own client roster (names) — they're booking with these families.
CREATE OR REPLACE FUNCTION get_coach_clients()
RETURNS TABLE (connection_id UUID, athlete_id UUID, athlete_name TEXT, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT cc.id,
           cc.athlete_id,
           COALESCE(NULLIF(trim(a.first_name || ' ' || COALESCE(a.last_name, '')), ''), 'Client'),
           cc.status
    FROM coach_connections cc
    LEFT JOIN athletes a ON a.id = cc.athlete_id
    WHERE cc.coach_id = my_coach_id()
    ORDER BY cc.created_at;
$$;
GRANT EXECUTE ON FUNCTION get_coach_clients() TO authenticated;

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON client_groups;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON client_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
