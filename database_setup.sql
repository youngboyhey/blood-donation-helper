-- Enable UUID extension
create extension if not exists "pgcrypto";

-- 1. Create Events Table
create table if not exists public.events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  date text not null, -- Keeping as text "YYYY-MM-DD" for simplicity with existing partial dates logic, or use date type
  time text,
  location text,
  city text,
  district text,
  organizer text,
  gift jsonb, -- Stores { "name": "...", "image": "..." }
  tags text[],
  source_url text,
  poster_url text, -- We will store the Supabase Storage URL here
  original_image_url text, -- Store original (source) image URL for deduplication checks
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS)
alter table public.events enable row level security;

-- 3. Create RLS Policies for Events
-- Allow public read access
create policy "Public events are viewable by everyone"
  on public.events for select
  using ( true );

-- Allow authenticated users (Admin) to insert/update/delete
create policy "Admins can manage events"
  on public.events for all
  using ( auth.role() = 'authenticated' );

-- 4. Setup Storage Bucket for Posters
-- Note: You might need to create the bucket 'posters' manually in the dashboard if this script fails on permission,
-- but usually inserting into storage.buckets works if extensions are enabled.
insert into storage.buckets (id, name, public)
values ('posters', 'posters', true)
on conflict (id) do nothing;

-- 5. Storage Policies
-- Allow public to view images
create policy "Poster images are publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'posters' );

-- Allow authenticated users to upload images
create policy "Admins can upload posters"
  on storage.objects for insert
  with check ( bucket_id = 'posters' and auth.role() = 'authenticated' );

-- Allow authenticated users to update/delete images
create policy "Admins can update posters"
  on storage.objects for update
  using ( bucket_id = 'posters' and auth.role() = 'authenticated' );

create policy "Admins can delete posters"
  on storage.objects for delete
  using ( bucket_id = 'posters' and auth.role() = 'authenticated' );
