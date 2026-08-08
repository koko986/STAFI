alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages drop constraint if exists messages_content_check;

alter table public.messages
  add constraint messages_type_check
  check (type in ('text', 'voice', 'ai', 'photo', 'video', 'file'));

alter table public.messages
  add constraint messages_content_check
  check (
    (type in ('text', 'ai') and nullif(btrim(body), '') is not null)
    or (type in ('voice', 'photo', 'video', 'file') and nullif(btrim(media_path), '') is not null)
  );

alter table public.ai_events drop constraint if exists ai_events_action_check;

alter table public.ai_events
  add constraint ai_events_action_check
  check (action in ('chat', 'summarize', 'draft-reply', 'question', 'voice'));
