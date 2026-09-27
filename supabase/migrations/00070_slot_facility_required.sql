-- ============================================================
-- Every availability block must have a facility.
-- NOT VALID: enforced on new/updated rows; older blocks without one are
-- flagged in the app ("Needs a facility") rather than breaking the migration.
-- Deleting a facility that still has blocks is blocked (was ON DELETE SET
-- NULL, which would orphan them); coaches hide unused facilities instead.
-- ============================================================
ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_facility_required;
ALTER TABLE slots ADD CONSTRAINT slots_facility_required CHECK (facility_id IS NOT NULL) NOT VALID;

ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_facility_id_fkey;
ALTER TABLE slots ADD CONSTRAINT slots_facility_id_fkey
    FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE RESTRICT;
