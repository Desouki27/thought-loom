-- pin search_path on functions (avoid search_path hijacking)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.match_notes(
  query_embedding extensions.vector(1536),
  match_count int default 8,
  exclude_note_id uuid default null
)
returns table (
  id uuid,
  title text,
  content text,
  similarity float
)
language sql
stable
set search_path = ''
as $$
  select n.id, n.title, n.content,
    1 - (n.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.notes n
  where n.embedding is not null
    and (exclude_note_id is null or n.id <> exclude_note_id)
  order by n.embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username) values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

-- handle_new_user should only run via the auth trigger, never as a callable RPC
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- index the note_clusters -> clusters foreign key
create index note_clusters_cluster_id_idx on public.note_clusters (cluster_id);

-- avoid per-row re-evaluation of auth.uid() in RLS policies
drop policy "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select
  using ((select auth.uid()) = id);

drop policy "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
  using ((select auth.uid()) = id);

drop policy "notes_all_own" on public.notes;
create policy "notes_all_own" on public.notes for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy "links_all_own" on public.links;
create policy "links_all_own" on public.links for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy "clusters_all_own" on public.clusters;
create policy "clusters_all_own" on public.clusters for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy "chat_messages_all_own" on public.chat_messages;
create policy "chat_messages_all_own" on public.chat_messages for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy "note_clusters_all_own" on public.note_clusters;
create policy "note_clusters_all_own" on public.note_clusters for all
  using (exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid())))
  with check (exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid())));
