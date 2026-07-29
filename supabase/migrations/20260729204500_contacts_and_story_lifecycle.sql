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

drop trigger if exists connections_set_updated_at on public.connections;
create trigger connections_set_updated_at
  before update on public.connections
  for each row execute procedure public.set_updated_at();

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

revoke all on function public.are_contacts(uuid, uuid) from public;
grant execute on function public.are_contacts(uuid, uuid) to authenticated, service_role;

alter table public.connections enable row level security;
alter table public.story_views enable row level security;

grant select, insert, update, delete on public.connections to authenticated;
grant select, insert, delete on public.story_views to authenticated;
grant all on public.connections, public.story_views to service_role;

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

create index if not exists connections_requester_status_idx
on public.connections(requester_id, status, updated_at desc);

create index if not exists connections_recipient_status_idx
on public.connections(recipient_id, status, updated_at desc);

create index if not exists story_views_viewer_viewed_idx
on public.story_views(viewer_id, viewed_at desc);
