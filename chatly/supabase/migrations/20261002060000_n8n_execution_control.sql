alter table public.ai_turns
  add column n8n_execution_id text,
  add column n8n_api_url text,
  add column n8n_stop_status text
    check (n8n_stop_status in ('stopped', 'already_finished', 'failed'));

alter table public.chat_assistant_requests
  add column n8n_execution_id text,
  add column n8n_api_url text,
  add column n8n_stop_status text
    check (n8n_stop_status in ('stopped', 'already_finished', 'failed'));

create function public.register_n8n_execution(
  p_user_id uuid, p_conversation_id uuid, p_id uuid, p_agent_id uuid,
  p_channel text, p_execution_id text, p_api_url text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_execution_id text;
  v_api_url text;
begin
  if p_execution_id !~ '^[1-9][0-9]{0,19}$' then
    raise exception 'INVALID_EXECUTION_ID';
  end if;
  if p_channel = 'agent' then
    select t.status, t.n8n_execution_id, t.n8n_api_url into v_status, v_execution_id, v_api_url
    from ai_turns t join ai_conversations c on c.id = t.conversation_id
    where t.id = p_id and t.user_id = p_user_id
      and t.conversation_id = p_conversation_id and c.agent_id = p_agent_id
    for update of t;
    if not found then raise exception 'FORBIDDEN'; end if;
    if v_execution_id is not null and (v_execution_id <> p_execution_id or v_api_url <> p_api_url) then
      raise exception 'EXECUTION_CONFLICT';
    end if;
    update ai_turns set n8n_execution_id = p_execution_id, n8n_api_url = p_api_url where id = p_id;
  elsif p_channel = 'assistant' then
    select r.status, r.n8n_execution_id, r.n8n_api_url into v_status, v_execution_id, v_api_url
    from chat_assistant_requests r join conversations c on c.id = r.conversation_id
    where r.id = p_id and r.user_id = p_user_id
      and r.conversation_id = p_conversation_id and c.ai_agent_id = p_agent_id
    for update of r;
    if not found then raise exception 'FORBIDDEN'; end if;
    if v_execution_id is not null and (v_execution_id <> p_execution_id or v_api_url <> p_api_url) then
      raise exception 'EXECUTION_CONFLICT';
    end if;
    update chat_assistant_requests set n8n_execution_id = p_execution_id, n8n_api_url = p_api_url where id = p_id;
  else
    raise exception 'INVALID_CHANNEL';
  end if;
  return v_status;
end;
$$;

revoke all on function public.register_n8n_execution(uuid,uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.register_n8n_execution(uuid,uuid,uuid,uuid,text,text,text)
  to service_role;
