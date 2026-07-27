-- ============================================================================
-- Boatmate — storage buckets and policies
--
-- All buckets are private; the app serves files through signed URLs.
-- Path convention is  {boat_id}/{...}  — the first path segment is the boat,
-- which is what every policy below authorises against.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 10485760, array[
    'image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'
  ]),
  ('documents', 'documents', false, 26214400, array[
    'application/pdf',
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]),
  ('media', 'media', false, 26214400, array[
    'image/jpeg','image/png','image/webp','image/heic','image/heif'
  ])
on conflict (id) do update
  set file_size_limit     = excluded.file_size_limit,
      allowed_mime_types  = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Uniform per-bucket policies: first path segment must be a boat you belong to.
-- ---------------------------------------------------------------------------
do $$
declare
  b text;
begin
  foreach b in array array['receipts', 'documents', 'media']
  loop
    execute format($f$
      create policy "members read %1$s"
        on storage.objects for select to authenticated
        using (
          bucket_id = %1$L
          and public.is_boat_member(((storage.foldername(name))[1])::uuid)
        );

      create policy "members upload %1$s"
        on storage.objects for insert to authenticated
        with check (
          bucket_id = %1$L
          and public.is_boat_member(((storage.foldername(name))[1])::uuid)
        );

      create policy "members replace %1$s"
        on storage.objects for update to authenticated
        using (
          bucket_id = %1$L
          and public.is_boat_member(((storage.foldername(name))[1])::uuid)
        )
        with check (
          bucket_id = %1$L
          and public.is_boat_member(((storage.foldername(name))[1])::uuid)
        );

      create policy "members delete %1$s"
        on storage.objects for delete to authenticated
        using (
          bucket_id = %1$L
          and public.is_boat_member(((storage.foldername(name))[1])::uuid)
        );
    $f$, b);
  end loop;
end;
$$;
