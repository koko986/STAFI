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
    select 1
    from public.stories
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
    select 1
    from public.stories
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
    select 1
    from public.stories
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
    select 1
    from public.stories
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
    select 1
    from public.stories
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
