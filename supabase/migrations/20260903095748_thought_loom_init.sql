-- extensions
create extension if not exists vector with schema extensions;

-- profiles ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username) values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- notes --------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_id_idx on public.notes (user_id);
create index notes_embedding_idx on public.notes using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notes_set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- links ----------------------------------------------------------------------
create type public.link_kind as enum ('manual', 'ai_suggested');
create type public.link_status as enum ('pending', 'accepted', 'dismissed');

create table public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_note_id uuid not null references public.notes(id) on delete cascade,
  target_note_id uuid not null references public.notes(id) on delete cascade,
  kind public.link_kind not null default 'manual',
  reason text,
  confidence real,
  status public.link_status not null default 'accepted',
  created_at timestamptz not null default now(),
  constraint links_no_self_link check (source_note_id <> target_note_id),
  constraint links_unique_pair unique (source_note_id, target_note_id)
);
create index links_user_id_idx on public.links (user_id);
create index links_source_idx on public.links (source_note_id);
create index links_target_idx on public.links (target_note_id);

-- clusters ---------------------------------------------------------------
create table public.clusters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clusters_user_id_idx on public.clusters (user_id);

create trigger clusters_set_updated_at before update on public.clusters
  for each row execute function public.set_updated_at();

create table public.note_clusters (
  note_id uuid not null references public.notes(id) on delete cascade,
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  primary key (note_id, cluster_id)
);

-- chat messages ------------------------------------------------------------
create type public.chat_role as enum ('user', 'assistant');

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.chat_role not null,
  content text not null,
  cited_note_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index chat_messages_user_id_idx on public.chat_messages (user_id);

-- vector similarity search (security invoker: RLS on notes still applies) --
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
as $$
  select n.id, n.title, n.content, 1 - (n.embedding <=> query_embedding) as similarity
  from public.notes n
  where n.embedding is not null
    and (exclude_note_id is null or n.id <> exclude_note_id)
  order by n.embedding <=> query_embedding
  limit match_count;
$$;

-- row level security ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.links enable row level security;
alter table public.clusters enable row level security;
alter table public.note_clusters enable row level security;
alter table public.chat_messages enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

create policy "notes_all_own" on public.notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "links_all_own" on public.links for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "clusters_all_own" on public.clusters for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chat_messages_all_own" on public.chat_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "note_clusters_all_own" on public.note_clusters for all
  using (exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid()));
