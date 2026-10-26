-- ============================================================
-- Shared family inbox — co-parents see the family's forwarded emails
-- process-email files a co-parent's forward under the primary admin's
-- account (findPrimaryAdminConfig), but forwarded_emails was readable only
-- by its owner (00009), so the co-parent's own inbox stayed empty. Parents
-- who both 'manage' an athlete now read, update (import/mark done) and
-- delete each other's forwarded emails. Inserts stay owner-only.
-- ============================================================

-- Users who manage at least one athlete I also manage (includes me).
CREATE OR REPLACE FUNCTION my_family_admin_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid()
    UNION
    SELECT other.admin_id
      FROM admin_athletes mine
      JOIN admin_athletes other ON other.athlete_id = mine.athlete_id
     WHERE mine.admin_id = auth.uid()
       AND mine.permission = 'manage'
       AND other.permission = 'manage'
$$;

DROP POLICY IF EXISTS "Family reads forwarded emails" ON forwarded_emails;
CREATE POLICY "Family reads forwarded emails"
    ON forwarded_emails FOR SELECT
    USING (user_id IN (SELECT my_family_admin_ids()));

DROP POLICY IF EXISTS "Family updates forwarded emails" ON forwarded_emails;
CREATE POLICY "Family updates forwarded emails"
    ON forwarded_emails FOR UPDATE
    USING (user_id IN (SELECT my_family_admin_ids()));

DROP POLICY IF EXISTS "Family deletes forwarded emails" ON forwarded_emails;
CREATE POLICY "Family deletes forwarded emails"
    ON forwarded_emails FOR DELETE
    USING (user_id IN (SELECT my_family_admin_ids()));
