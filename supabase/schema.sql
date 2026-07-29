create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New User',
  username text,
  bio text not null default '',
  avatar_path text,
  theme_mode text not null default 'system' check (theme_mode in ('light', 'dark', 'system')),
  accent_color text not null default '#2563eb',
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists onboarded boolean not null default false;

update public.profiles
set username = 'user_' || left(replace(id::text, '-', ''), 8)
where username is null or username = '';

alter table public.profiles alter column username set not null;

create unique index if not exists profiles_username_lower_idx
on public.profiles (lower(username));

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group', 'ai_private')),
  title text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  last_read_message_id uuid,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('text', 'voice', 'ai')),
  body text,
  media_path text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  media_path text not null,
  caption text,
  visibility text not null default 'contacts' check (visibility in ('contacts', 'public')),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_events (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  action text not null,
  prompt text not null,
  response text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, username, avatar_path)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.phone, 'New User'),
    'user_' || left(replace(new.id::text, '-', ''), 8),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.stories enable row level security;
alter table public.ai_events enable row level security;

create policy "profiles are visible to authenticated users"
on public.profiles for select
to authenticated
using (true);

create policy "users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "members can view conversations"
on public.conversations for select
to authenticated
using (
  exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = id and cm.user_id = auth.uid()
  )
);

create policy "authenticated users can create conversations"
on public.conversations for insert
to authenticated
with check (created_by = auth.uid());

create policy "users can join conversations"
on public.conversation_members for insert
to authenticated
with check (user_id = auth.uid());

create policy "members can view memberships"
on public.conversation_members for select
to authenticated
using (user_id = auth.uid());

create policy "members can view messages"
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid()
  )
);

create policy "members can send messages"
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid()
  )
);

create policy "owners can manage stories"
on public.stories for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "authenticated users can view unexpired stories"
on public.stories for select
to authenticated
using (expires_at > now());

create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index if not exists stories_owner_expires_idx on public.stories(owner_id, expires_at desc);
