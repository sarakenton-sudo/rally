-- ============================================================
-- Coaching & Lessons Module — account personas + parent↔coach connect (PR 6)
-- Three signup personas: parent (default), coach, athlete (invite-claim).
-- account_type is a plain TEXT column (NOT the user_role enum) so we never hit
-- the "ALTER TYPE ADD VALUE can't run in a transaction" problem.
-- ============================================================

ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'parent'
        CHECK (account_type IN ('parent', 'coach', 'athlete'));

-- New signups carry account_type in auth metadata; persist it on the profile.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type TEXT;
BEGIN
    v_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'parent');
    IF v_type NOT IN ('parent', 'coach', 'athlete') THEN
        v_type := 'parent';
    END IF;
    INSERT INTO user_profiles (id, role, display_name, account_type)
    VALUES (NEW.id, 'admin', NULL, v_type)
    ON CONFLICT (id) DO UPDATE SET account_type = EXCLUDED.account_type;
    RETURN NEW;
END;
$$;

-- Every coach gets a shareable connect code (was previously private-only).
UPDATE coaches
   SET invite_code = upper(substr(md5(random()::text || id::text), 1, 8))
 WHERE invite_code IS NULL OR invite_code = '';

-- ------------------------------------------------------------
-- connect_to_coach: a parent enters a coach's code to connect. Forms the roster
-- link so the parent can then see that coach's open slots and book. (A future
-- in-app browse/directory would reach the same booking surface a different way.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION connect_to_coach(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach coaches%ROWTYPE;
    v_uid   UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'auth required';
    END IF;

    SELECT * INTO v_coach FROM coaches
     WHERE upper(invite_code) = upper(trim(p_code));
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No coach found for that code';
    END IF;

    INSERT INTO coach_connections (coach_id, parent_user_id, status)
    VALUES (v_coach.id, v_uid, 'active')
    ON CONFLICT (coach_id, parent_user_id) DO UPDATE SET status = 'active';

    RETURN jsonb_build_object(
        'coach_id', v_coach.id,
        'display_name', v_coach.display_name,
        'slug', v_coach.slug,
        'success', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION connect_to_coach(TEXT) TO authenticated;
