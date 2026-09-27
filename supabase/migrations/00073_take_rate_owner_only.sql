-- ============================================================
-- Take rate: editable only by admin owners (not CS reps), from the admin
-- panel's Settings page. Launch at 0% for coaches.
-- ============================================================
DROP POLICY IF EXISTS "Platform settings admin update" ON platform_settings;
CREATE POLICY "Platform settings owner update" ON platform_settings
    FOR UPDATE USING (admin_role() = 'owner') WITH CHECK (admin_role() = 'owner');

UPDATE platform_settings SET platform_fee_bps = 0, updated_at = now() WHERE id;
