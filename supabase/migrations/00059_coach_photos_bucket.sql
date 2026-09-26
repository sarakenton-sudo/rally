-- ============================================================
-- Coaching & Lessons Module — coach profile photo storage (PR 4b)
-- Public-read bucket; each coach can write only under their own auth.uid() folder.
-- Path convention: coach-photos/<auth.uid()>/<filename>
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('coach-photos', 'coach-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (it's a public bucket; profile photos are shown on listings).
CREATE POLICY "Public read coach photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'coach-photos');

-- A user may write only within their own uid-prefixed folder.
CREATE POLICY "Coaches upload own photo"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'coach-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Coaches update own photo"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'coach-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Coaches delete own photo"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'coach-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
