create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New User'
    check (char_length(display_name) between 2 and 48),
  username text check (username ~ '^[a-z0-9_]{3,24}$'),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_path text,
  theme_mode text not null default 'system' check (theme_mode in ('light', 'dark', 'system')),
  accent_color text not null default '#2563eb' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
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
  title text check (title is null or char_length(btrim(title)) between 2 and 64),
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
  deleted_at timestamptz,
  constraint messages_content_check check (
    (type in ('text', 'ai') and nullif(btrim(body), '') is not null)
    or (type = 'voice' and nullif(btrim(media_path), '') is not null)
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversation_members_last_read_message_fk'
  ) then
    alter table public.conversation_members
      add constraint conversation_members_last_read_message_fk
      foreign key (last_read_message_id)
      references public.messages(id)
      on delete set null;
  end if;
end
$$;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  media_path text not null,
  caption text check (caption is null or char_length(caption) <= 200),
  visibility text not null default 'contacts' check (visibility in ('contacts', 'public')),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_events (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  action text not null check (action in ('summarize', 'draft-reply')),
  prompt text not null,
  response text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

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

insert into public.profiles (id, display_name, username, avatar_path)
select
  id,
  coalesce(
    nullif(raw_user_meta_data ->> 'full_name', ''),
    nullif(phone, ''),
    'New User'
  ),
  'user_' || left(replace(id::text, '-', ''), 8),
  coalesce(
    raw_user_meta_data ->> 'avatar_url',
    raw_user_meta_data ->> 'picture'
  )
from auth.users
on conflict (id) do nothing;

create or replace function public.is_conversation_member(
  target_conversation_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members
    where conversation_id = target_conversation_id
      and user_id = target_user_id
  );
$$;

create or replace function public.can_manage_conversation(
  target_conversation_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations
    where id = target_conversation_id
      and created_by = target_user_id
  ) or exists (
    select 1
    from public.conversation_members
    where conversation_id = target_conversation_id
      and user_id = target_user_id
      and role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_conversation_member(uuid, uuid) from public;
revoke all on function public.can_manage_conversation(uuid, uuid) from public;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_conversation(uuid, uuid) to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.stories enable row level security;
alter table public.ai_events enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversation_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.stories to authenticated;
grant select, insert on public.ai_events to authenticated;
grant all on public.profiles, public.conversations, public.conversation_members,
  public.messages, public.stories, public.ai_events to service_role;

drop policy if exists "profiles are visible to authenticated users" on public.profiles;
create policy "profiles are visible to authenticated users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users can create own profile" on public.profiles;
create policy "users can create own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "members can view conversations" on public.conversations;
create policy "members can view conversations"
on public.conversations for select
to authenticated
using (public.is_conversation_member(id));

drop policy if exists "authenticated users can create conversations" on public.conversations;
create policy "authenticated users can create conversations"
on public.conversations for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "conversation managers can update conversations" on public.conversations;
create policy "conversation managers can update conversations"
on public.conversations for update
to authenticated
using (public.can_manage_conversation(id))
with check (public.can_manage_conversation(id));

drop policy if exists "conversation owners can delete conversations" on public.conversations;
create policy "conversation owners can delete conversations"
on public.conversations for delete
to authenticated
using (created_by = auth.uid());

drop policy if exists "users can join conversations" on public.conversation_members;
drop policy if exists "users and managers can add memberships" on public.conversation_members;
create policy "users and managers can add memberships"
on public.conversation_members for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.can_manage_conversation(conversation_id)
);

drop policy if exists "members can view memberships" on public.conversation_members;
create policy "members can view memberships"
on public.conversation_members for select
to authenticated
using (public.is_conversation_member(conversation_id));

drop policy if exists "members can update own read state" on public.conversation_members;
create policy "members can update own read state"
on public.conversation_members for update
to authenticated
using (user_id = auth.uid() or public.can_manage_conversation(conversation_id))
with check (user_id = auth.uid() or public.can_manage_conversation(conversation_id));

drop policy if exists "users and managers can remove memberships" on public.conversation_members;
create policy "users and managers can remove memberships"
on public.conversation_members for delete
to authenticated
using (user_id = auth.uid() or public.can_manage_conversation(conversation_id));

drop policy if exists "members can view messages" on public.messages;
create policy "members can view messages"
on public.messages for select
to authenticated
using (public.is_conversation_member(conversation_id));

drop policy if exists "members can send messages" on public.messages;
create policy "members can send messages"
on public.messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.is_conversation_member(conversation_id)
);

drop policy if exists "senders can edit own messages" on public.messages;
create policy "senders can edit own messages"
on public.messages for update
to authenticated
using (sender_id = auth.uid())
with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

drop policy if exists "senders can delete own messages" on public.messages;
create policy "senders can delete own messages"
on public.messages for delete
to authenticated
using (sender_id = auth.uid());

drop policy if exists "owners can manage stories" on public.stories;
create policy "owners can manage stories"
on public.stories for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "authenticated users can view unexpired stories" on public.stories;
create policy "authenticated users can view unexpired stories"
on public.stories for select
to authenticated
using (expires_at > now());

drop policy if exists "users can view own ai events" on public.ai_events;
create policy "users can view own ai events"
on public.ai_events for select
to authenticated
using (requester_id = auth.uid());

drop policy if exists "users can create own ai events" on public.ai_events;
create policy "users can create own ai events"
on public.ai_events for insert
to authenticated
with check (
  requester_id = auth.uid()
  and (
    conversation_id is null
    or public.is_conversation_member(conversation_id)
  )
);

create index if not exists conversations_created_by_created_idx
on public.conversations(created_by, created_at desc);

create index if not exists conversation_members_user_joined_idx
on public.conversation_members(user_id, joined_at desc);

create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index if not exists stories_owner_expires_idx on public.stories(owner_id, expires_at desc);
create index if not exists stories_expires_idx on public.stories(expires_at);
create index if not exists ai_events_requester_created_idx on public.ai_events(requester_id, created_at desc);
