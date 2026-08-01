create table if not exists public.message_deletions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_deletions enable row level security;

grant select, insert, delete on public.message_deletions to authenticated;
grant all on public.message_deletions to service_role;

drop policy if exists "users can view own hidden messages" on public.message_deletions;
create policy "users can view own hidden messages"
on public.message_deletions for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can hide messages for themselves" on public.message_deletions;
create policy "users can hide messages for themselves"
on public.message_deletions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages
    where messages.id = message_deletions.message_id
      and public.is_conversation_member(messages.conversation_id)
  )
);

drop policy if exists "users can restore own hidden messages" on public.message_deletions;
create policy "users can restore own hidden messages"
on public.message_deletions for delete
to authenticated
using (user_id = auth.uid());

create index if not exists message_deletions_user_idx on public.message_deletions(user_id, deleted_at desc);
