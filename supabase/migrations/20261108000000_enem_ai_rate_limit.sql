-- Limite de uso da IA do ENEM Relâmpago. Schema próprio, sem relação com as tabelas do NEXA.
create schema if not exists enem;
revoke all on schema enem from public, anon, authenticated;

create table if not exists enem.ai_calls (
  id bigint generated always as identity primary key,
  client_hash text not null,
  at timestamptz not null default now()
);
create index if not exists ai_calls_client_at on enem.ai_calls (client_hash, at desc);
create index if not exists ai_calls_at on enem.ai_calls (at desc);
alter table enem.ai_calls enable row level security;

-- Registra uma chamada e diz se ela cabe nos limites (por aparelho por hora e total por dia).
create or replace function public.enem_ai_take(p_client text, p_per_hour int default 40, p_per_day int default 600)
returns text
language plpgsql
security definer
set search_path = enem, pg_temp
as $$
declare
  v_hour int;
  v_day int;
begin
  if p_client is null or length(p_client) < 8 or length(p_client) > 128 then
    return 'invalid';
  end if;
  perform pg_advisory_xact_lock(hashtext('enem_ai:' || p_client));
  select count(*) into v_hour from enem.ai_calls where client_hash = p_client and at > now() - interval '1 hour';
  if v_hour >= p_per_hour then return 'client_limit'; end if;
  select count(*) into v_day from enem.ai_calls where at > now() - interval '1 day';
  if v_day >= p_per_day then return 'daily_limit'; end if;
  insert into enem.ai_calls (client_hash) values (p_client);
  delete from enem.ai_calls where at < now() - interval '2 days';
  return 'ok';
end;
$$;

revoke all on function public.enem_ai_take(text, int, int) from public, anon, authenticated;
grant execute on function public.enem_ai_take(text, int, int) to service_role;
