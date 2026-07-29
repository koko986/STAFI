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

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);

create unique index if not exists connections_unique_pair_idx
on public.connections (
  least(requester_id, recipient_id),
  greatest(requester_id, recipient_id)
);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create table if not exists public.ai_events (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  action text not null check (action in ('chat', 'summarize', 'draft-reply')),
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

drop trigger if exists connections_set_updated_at on public.connections;
create trigger connections_set_updated_at
  before update on public.connections
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

create or replace function public.are_contacts(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select first_user_id = second_user_id or exists (
    select 1
    from public.connections
    where status = 'accepted'
      and (
        (requester_id = first_user_id and recipient_id = second_user_id)
        or (requester_id = second_user_id and recipient_id = first_user_id)
      )
  );
$$;

revoke all on function public.is_conversation_member(uuid, uuid) from public;
revoke all on function public.can_manage_conversation(uuid, uuid) from public;
revoke all on function public.are_contacts(uuid, uuid) from public;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_conversation(uuid, uuid) to authenticated, service_role;
grant execute on function public.are_contacts(uuid, uuid) to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.stories enable row level security;
alter table public.connections enable row level security;
alter table public.story_views enable row level security;
alter table public.ai_events enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversation_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.stories to authenticated;
grant select, insert, update, delete on public.connections to authenticated;
grant select, insert, delete on public.story_views to authenticated;
grant select, insert on public.ai_events to authenticated;
grant all on public.profiles, public.conversations, public.conversation_members,
  public.messages, public.stories, public.connections, public.story_views,
  public.ai_events to service_role;

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
drop policy if exists "users can view allowed unexpired stories" on public.stories;
create policy "users can view allowed unexpired stories"
on public.stories for select
to authenticated
using (
  expires_at > now()
  and (
    owner_id = auth.uid()
    or visibility = 'public'
    or public.are_contacts(owner_id, auth.uid())
  )
);

drop policy if exists "participants can view connections" on public.connections;
create policy "participants can view connections"
on public.connections for select
to authenticated
using (auth.uid() in (requester_id, recipient_id));

drop policy if exists "users can request contacts" on public.connections;
create policy "users can request contacts"
on public.connections for insert
to authenticated
with check (requester_id = auth.uid() and status = 'pending');

drop policy if exists "recipients can accept contact requests" on public.connections;
create policy "recipients can accept contact requests"
on public.connections for update
to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid() and status = 'accepted');

drop policy if exists "participants can remove connections" on public.connections;
create policy "participants can remove connections"
on public.connections for delete
to authenticated
using (auth.uid() in (requester_id, recipient_id));

drop policy if exists "viewers can create story receipts" on public.story_views;
create policy "viewers can create story receipts"
on public.story_views for insert
to authenticated
with check (
  viewer_id = auth.uid()
  and exists (
    select 1
    from public.stories
    where id = story_id
      and expires_at > now()
      and (
        owner_id = auth.uid()
        or visibility = 'public'
        or public.are_contacts(owner_id, auth.uid())
      )
  )
);

drop policy if exists "owners and viewers can read story receipts" on public.story_views;
create policy "owners and viewers can read story receipts"
on public.story_views for select
to authenticated
using (
  viewer_id = auth.uid()
  or exists (
    select 1 from public.stories
    where id = story_id and owner_id = auth.uid()
  )
);

drop policy if exists "viewers can remove own story receipts" on public.story_views;
create policy "viewers can remove own story receipts"
on public.story_views for delete
to authenticated
using (viewer_id = auth.uid());

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
create index if not exists connections_requester_status_idx
on public.connections(requester_id, status, updated_at desc);
create index if not exists connections_recipient_status_idx
on public.connections(recipient_id, status, updated_at desc);
create index if not exists story_views_viewer_viewed_idx
on public.story_views(viewer_id, viewed_at desc);
create index if not exists ai_events_requester_created_idx on public.ai_events(requester_id, created_at desc);

create or replace function public.ensure_ai_conversation(requester_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.conversations;
begin
  if not exists (select 1 from public.profiles where id = requester_id) then
    raise exception 'Profile not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai:' || requester_id::text, 0));

  select c.* into result
  from public.conversations c
  join public.conversation_members cm on cm.conversation_id = c.id
  where c.type = 'ai_private'
    and cm.user_id = requester_id
  order by c.created_at
  limit 1;

  if result.id is null then
    insert into public.conversations (type, title, created_by)
    values ('ai_private', 'AI Assistant', requester_id)
    returning * into result;

    insert into public.conversation_members (conversation_id, user_id, role)
    values (result.id, requester_id, 'owner');

    insert into public.messages (conversation_id, sender_id, type, body)
    values (
      result.id,
      null,
      'text',
      'Ask me to summarize a conversation or draft a reply.'
    );
  end if;

  return result;
end;
$$;

create or replace function public.start_direct_conversation(
  requester_id uuid,
  other_user_id uuid
)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.conversations;
  lock_key text;
begin
  if requester_id = other_user_id then
    raise exception 'You cannot start a chat with yourself';
  end if;
  if not exists (select 1 from public.profiles where id = requester_id) then
    raise exception 'Your profile was not found';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = other_user_id and onboarded = true
  ) then
    raise exception 'Profile not found';
  end if;

  lock_key = 'direct:' || least(requester_id::text, other_user_id::text)
    || ':' || greatest(requester_id::text, other_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  select c.* into result
  from public.conversations c
  where c.type = 'direct'
    and exists (
      select 1 from public.conversation_members
      where conversation_id = c.id and user_id = requester_id
    )
    and exists (
      select 1 from public.conversation_members
      where conversation_id = c.id and user_id = other_user_id
    )
    and (
      select count(*) from public.conversation_members
      where conversation_id = c.id
    ) = 2
  order by c.created_at
  limit 1;

  if result.id is null then
    insert into public.conversations (type, title, created_by)
    values ('direct', null, requester_id)
    returning * into result;

    insert into public.conversation_members (conversation_id, user_id, role)
    values
      (result.id, requester_id, 'owner'),
      (result.id, other_user_id, 'member');

    insert into public.messages (conversation_id, sender_id, type, body)
    values (result.id, null, 'text', 'You are connected. Say hello!');
  end if;

  return result;
end;
$$;

create or replace function public.create_group_conversation(
  requester_id uuid,
  group_title text,
  member_ids uuid[]
)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.conversations;
  creator_name text;
begin
  group_title = btrim(group_title);
  if char_length(group_title) not between 2 and 64 then
    raise exception 'Group name must be 2-64 characters';
  end if;
  if coalesce(array_length(member_ids, 1), 0) = 0 then
    raise exception 'Select at least one group member';
  end if;
  if exists (
    select 1
    from unnest(member_ids) selected_id
    left join public.profiles p on p.id = selected_id
    where p.id is null or p.onboarded = false
  ) then
    raise exception 'A selected profile was not found';
  end if;

  select display_name into creator_name
  from public.profiles
  where id = requester_id;
  if creator_name is null then
    raise exception 'Your profile was not found';
  end if;

  insert into public.conversations (type, title, created_by)
  values ('group', group_title, requester_id)
  returning * into result;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (result.id, requester_id, 'owner');

  insert into public.conversation_members (conversation_id, user_id, role)
  select result.id, selected_id, 'member'
  from (select distinct unnest(member_ids) as selected_id) selected
  where selected_id <> requester_id
  on conflict (conversation_id, user_id) do nothing;

  insert into public.messages (conversation_id, sender_id, type, body)
  values (result.id, null, 'text', creator_name || ' created the group.');

  return result;
end;
$$;

create or replace function public.list_user_conversations(requester_id uuid)
returns table (
  id uuid,
  type text,
  title text,
  created_by uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.type,
    case
      when c.type = 'direct' then coalesce((
        select p.display_name
        from public.conversation_members other_member
        join public.profiles p on p.id = other_member.user_id
        where other_member.conversation_id = c.id
          and other_member.user_id <> requester_id
        limit 1
      ), 'Direct chat')
      else coalesce(c.title, 'Untitled chat')
    end as title,
    c.created_by,
    c.created_at
  from public.conversations c
  where exists (
    select 1
    from public.conversation_members own_membership
    where own_membership.conversation_id = c.id
      and own_membership.user_id = requester_id
  )
  order by c.created_at desc;
$$;

revoke all on function public.ensure_ai_conversation(uuid) from public;
revoke all on function public.start_direct_conversation(uuid, uuid) from public;
revoke all on function public.create_group_conversation(uuid, text, uuid[]) from public;
revoke all on function public.list_user_conversations(uuid) from public;
grant execute on function public.ensure_ai_conversation(uuid) to service_role;
grant execute on function public.start_direct_conversation(uuid, uuid) to service_role;
grant execute on function public.create_group_conversation(uuid, text, uuid[]) to service_role;
grant execute on function public.list_user_conversations(uuid) to service_role;

create table if not exists public.story_reactions (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('heart', 'fire', 'like', 'laugh', 'clap')),
  reacted_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.story_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.story_reactions enable row level security;
alter table public.story_replies enable row level security;

grant select, insert, update, delete on public.story_reactions to authenticated;
grant select, insert, delete on public.story_replies to authenticated;
grant all on public.story_reactions, public.story_replies to service_role;

drop policy if exists "story viewers can read reactions" on public.story_reactions;
create policy "story viewers can read reactions"
on public.story_reactions for select
to authenticated
using (
  exists (
    select 1 from public.stories
    where stories.id = story_reactions.story_id
      and stories.expires_at > now()
      and (
        stories.owner_id = auth.uid()
        or stories.visibility = 'public'
        or public.are_contacts(stories.owner_id, auth.uid())
      )
  )
);

drop policy if exists "users can react to visible stories" on public.story_reactions;
create policy "users can react to visible stories"
on public.story_reactions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.stories
    where stories.id = story_reactions.story_id
      and stories.owner_id <> auth.uid()
      and stories.expires_at > now()
      and (
        stories.visibility = 'public'
        or public.are_contacts(stories.owner_id, auth.uid())
      )
  )
);

drop policy if exists "users can change own story reactions" on public.story_reactions;
create policy "users can change own story reactions"
on public.story_reactions for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can remove own story reactions" on public.story_reactions;
create policy "users can remove own story reactions"
on public.story_reactions for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "participants can read private story replies" on public.story_replies;
create policy "participants can read private story replies"
on public.story_replies for select
to authenticated
using (
  sender_id = auth.uid()
  or exists (
    select 1 from public.stories
    where stories.id = story_replies.story_id
      and stories.owner_id = auth.uid()
  )
);

drop policy if exists "users can reply to visible stories" on public.story_replies;
create policy "users can reply to visible stories"
on public.story_replies for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.stories
    where stories.id = story_replies.story_id
      and stories.owner_id <> auth.uid()
      and stories.expires_at > now()
      and (
        stories.visibility = 'public'
        or public.are_contacts(stories.owner_id, auth.uid())
      )
  )
);

drop policy if exists "participants can delete story replies" on public.story_replies;
create policy "participants can delete story replies"
on public.story_replies for delete
to authenticated
using (
  sender_id = auth.uid()
  or exists (
    select 1 from public.stories
    where stories.id = story_replies.story_id
      and stories.owner_id = auth.uid()
  )
);

create index if not exists story_reactions_story_reacted_idx
on public.story_reactions(story_id, reacted_at desc);
create index if not exists story_replies_story_created_idx
on public.story_replies(story_id, created_at);
create index if not exists story_replies_sender_created_idx
on public.story_replies(sender_id, created_at desc);
