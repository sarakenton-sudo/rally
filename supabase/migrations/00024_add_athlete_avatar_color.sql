-- Add avatar_color column to athletes for visual identification on tournament cards
ALTER TABLE athletes ADD COLUMN avatar_color TEXT DEFAULT NULL;
