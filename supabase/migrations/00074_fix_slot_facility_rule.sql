-- ============================================================
-- Fix 00070: the NOT VALID check still fires on ANY update of an older block
-- with no facility — including request_booking bumping seats_taken — so
-- families got "violates check constraint slots_facility_required".
-- Enforce the rule only when a block is created or its facility is changed.
-- ============================================================
ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_facility_required;

CREATE OR REPLACE FUNCTION require_slot_facility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.facility_id IS NULL THEN
        RAISE EXCEPTION 'Every availability block needs a facility';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS slots_require_facility ON slots;
CREATE TRIGGER slots_require_facility
    BEFORE INSERT OR UPDATE OF facility_id ON slots
    FOR EACH ROW EXECUTE FUNCTION require_slot_facility();
