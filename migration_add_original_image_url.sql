-- Add original_image_url column to events table
-- This column is used to store the original source URL of the image for deduplication purposes,
-- since the poster_url will now be a Supabase Storage URL.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'original_image_url') THEN
        ALTER TABLE public.events ADD COLUMN original_image_url text;
    END IF;
END $$;
