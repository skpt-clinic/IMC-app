-- =================================================================
-- STORAGE BUCKETS & POLICIES MIGRATION
-- Project: jvfivixnmcwsruaktirr
-- Created: 2026-09-14
-- =================================================================

-- 1. Create Storage Buckets if they don't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('patient-photos', 'patient-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']),
  ('body-charts', 'body-charts', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']),
  ('signatures', 'signatures', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']),
  ('visit-evidence', 'visit-evidence', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Drop existing policies on storage.objects to prevent duplicates
DROP POLICY IF EXISTS "Public and authenticated read images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete images" ON storage.objects;

-- 3. Create Storage Policies on storage.objects

-- Allow public read access (anon and authenticated) to view images in buckets
CREATE POLICY "Public and authenticated read images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id IN ('patient-photos', 'body-charts', 'signatures', 'visit-evidence'));

-- Allow authenticated users to upload new image files
CREATE POLICY "Authenticated upload images"
ON storage.objects
FOR INSERT
TO authenticated, anon
WITH CHECK (bucket_id IN ('patient-photos', 'body-charts', 'signatures', 'visit-evidence'));

-- Allow users to update/overwrite image files
CREATE POLICY "Authenticated update images"
ON storage.objects
FOR UPDATE
TO authenticated, anon
USING (bucket_id IN ('patient-photos', 'body-charts', 'signatures', 'visit-evidence'));

-- Allow users to delete image files if needed
CREATE POLICY "Authenticated delete images"
ON storage.objects
FOR DELETE
TO authenticated, anon
USING (bucket_id IN ('patient-photos', 'body-charts', 'signatures', 'visit-evidence'));
