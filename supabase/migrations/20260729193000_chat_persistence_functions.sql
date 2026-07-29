alter table public.ai_events
  drop constraint if exists ai_events_action_check;

alter table public.ai_events
  add constraint ai_events_action_check
  check (action in ('chat', 'summarize', 'draft-reply'));

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
