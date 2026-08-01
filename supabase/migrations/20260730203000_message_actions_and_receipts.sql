alter table public.messages
  add column if not exists reply_to_message_id uuid references public.messages(id) on delete set null,
  add column if not exists forwarded_from_message_id uuid references public.messages(id) on delete set null;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('heart', 'fire', 'like', 'laugh', 'clap')),
  reacted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_reactions enable row level security;

grant select, insert, update, delete on public.message_reactions to authenticated;
grant all on public.message_reactions to service_role;

drop policy if exists "members can view message reactions" on public.message_reactions;
create policy "members can view message reactions"
on public.message_reactions for select
to authenticated
using (
  exists (
    select 1 from public.messages
    where messages.id = message_reactions.message_id
      and public.is_conversation_member(messages.conversation_id)
  )
);

drop policy if exists "members can react to messages" on public.message_reactions;
create policy "members can react to messages"
on public.message_reactions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.messages
    where messages.id = message_reactions.message_id
      and public.is_conversation_member(messages.conversation_id)
  )
);

drop policy if exists "users can change own message reactions" on public.message_reactions;
create policy "users can change own message reactions"
on public.message_reactions for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can remove own message reactions" on public.message_reactions;
create policy "users can remove own message reactions"
on public.message_reactions for delete
to authenticated
using (user_id = auth.uid());

create index if not exists messages_reply_idx on public.messages(reply_to_message_id);
create index if not exists messages_forward_idx on public.messages(forwarded_from_message_id);
create index if not exists message_reactions_reacted_idx on public.message_reactions(message_id, reacted_at desc);
