create function public.get_completed_ai_history(
  p_user_id uuid, p_conversation_id uuid, p_channel text
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_history jsonb;
begin
  if p_channel = 'agent' then
    if not exists (
      select 1 from ai_conversations where id = p_conversation_id and user_id = p_user_id
    ) then raise exception 'FORBIDDEN'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('content', content, 'reply', reply)
      order by created_at, id), '[]'::jsonb) into v_history
    from (
      select id, content, reply, created_at from ai_turns
      where conversation_id = p_conversation_id and user_id = p_user_id
        and status = 'completed' and reply is not null
      order by created_at desc, id desc limit 12
    ) recent;
  elsif p_channel = 'assistant' then
    if not exists (
      select 1 from conversations where id = p_conversation_id
        and created_by = p_user_id and type = 'ai'
    ) then raise exception 'FORBIDDEN'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('content', content, 'reply', reply)
      order by created_at, id), '[]'::jsonb) into v_history
    from (
      select r.id, r.content, m.content as reply, r.created_at
      from chat_assistant_requests r
      join messages m on m.conversation_id = r.conversation_id
        and m.metadata->>'ai_request_id' = r.id::text
        and m.metadata->>'sender_type' = 'ai'
      where r.conversation_id = p_conversation_id and r.user_id = p_user_id
        and r.status = 'completed' and m.content is not null
      order by r.created_at desc, r.id desc limit 12
    ) recent;
  else
    raise exception 'INVALID_CHANNEL';
  end if;
  return v_history;
end;
$$;

revoke all on function public.get_completed_ai_history(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.get_completed_ai_history(uuid,uuid,text) to service_role;
