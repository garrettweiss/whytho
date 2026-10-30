-- photo_source_url
--
-- The photo pipeline overwrote politicians.photo_url with the Storage mirror
-- URL and kept no record of where the image came from, so the mirror became
-- the only copy. When Supabase restricted Storage in October 2026 for
-- exceeding the free tier's 1 GB cap, 5,784 profiles had no fallback.
--
-- Additive. Safe to paste into the SQL editor.

alter table public.politicians
  add column if not exists photo_source_url text;

comment on column public.politicians.photo_source_url is
  'Original external URL the portrait was mirrored from. Null for rows mirrored before October 2026.';
