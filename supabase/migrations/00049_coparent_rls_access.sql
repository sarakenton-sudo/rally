-- Co-parents need to see forwarded emails and guests from shared accounts
-- Uses same pattern as admin_config: accessible if you share athletes with the primary admin

-- 1. Fix forwarded_emails: co-parents can see emails belonging to primary admins they share athletes with
DROP POLICY IF EXISTS "Users read own forwarded emails" ON forwarded_emails;
DROP POLICY IF EXISTS "Owner manages own emails" ON forwarded_emails;

CREATE POLICY "Users read accessible forwarded emails"
    ON forwarded_emails FOR SELECT
    USING (
        user_id = auth.uid()
        OR user_id IN (
            SELECT DISTINCT aa_primary.admin_id
            FROM admin_athletes aa_primary
            INNER JOIN admin_athletes aa_me ON aa_me.athlete_id = aa_primary.athlete_id
            WHERE aa_me.admin_id = auth.uid()
              AND aa_primary.is_primary = true
        )
    );

-- Co-parents can update (e.g. mark action_taken) on shared emails
DROP POLICY IF EXISTS "Users update own forwarded emails" ON forwarded_emails;

CREATE POLICY "Users update accessible forwarded emails"
    ON forwarded_emails FOR UPDATE
    USING (
        user_id = auth.uid()
        OR user_id IN (
            SELECT DISTINCT aa_primary.admin_id
            FROM admin_athletes aa_primary
            INNER JOIN admin_athletes aa_me ON aa_me.athlete_id = aa_primary.athlete_id
            WHERE aa_me.admin_id = auth.uid()
              AND aa_primary.is_primary = true
        )
    );

-- 2. Fix guests: co-parents can see guests linked to shared athletes
DROP POLICY IF EXISTS "Users read own guests" ON guests;
DROP POLICY IF EXISTS "Users read accessible guests" ON guests;

CREATE POLICY "Users read accessible guests"
    ON guests FOR SELECT
    USING (
        user_id = auth.uid()
        OR athlete_id IN (SELECT my_athlete_ids())
    );

DROP POLICY IF EXISTS "Users update own guests" ON guests;

CREATE POLICY "Users update accessible guests"
    ON guests FOR UPDATE
    USING (
        user_id = auth.uid()
        OR athlete_id IN (SELECT my_athlete_ids())
    );

DROP POLICY IF EXISTS "Users delete own guests" ON guests;

CREATE POLICY "Users delete accessible guests"
    ON guests FOR DELETE
    USING (
        user_id = auth.uid()
        OR can_write_athlete(athlete_id)
    );
