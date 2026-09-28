-- ADMS Braga v97 — limite de tentativas na validação de acesso.

begin;

create schema if not exists private;

create table if not exists private.tentativas_solicitacao_acesso (
  id bigint generated always as identity primary key,
  client_key text not null,
  criado_em timestamptz not null default now()
);

create index if not exists tentativas_acesso_client_data_v97_idx
  on private.tentativas_solicitacao_acesso (client_key, criado_em desc);

alter table private.tentativas_solicitacao_acesso enable row level security;
revoke all on table private.tentativas_solicitacao_acesso from public, anon, authenticated;

create or replace function public.solicitar_acesso_membro_v96(
  p_numero_membro text,
  p_nome text,
  p_email text,
  p_contacto text,
  p_data_nascimento date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro public.membros%rowtype;
  v_numero text := upper(regexp_replace(coalesce(p_numero_membro, ''), '[^A-Za-z0-9]', '', 'g'));
  v_nome text := lower(regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_contacto text := regexp_replace(coalesce(p_contacto, ''), '[^0-9]', '', 'g');
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text;
  v_client_key text;
  v_falhas integer;
  v_primeira_falha timestamptz;
  v_retry integer;
begin
  v_ip := coalesce(
    nullif(v_headers ->> 'cf-connecting-ip', ''),
    nullif(split_part(v_headers ->> 'x-forwarded-for', ',', 1), ''),
    nullif(v_headers ->> 'x-real-ip', ''),
    'desconhecido'
  );
  v_client_key := md5(v_ip || '|' || coalesce(v_headers ->> 'user-agent', 'sem-agente'));

  delete from private.tentativas_solicitacao_acesso
  where criado_em < now() - interval '24 hours';

  select count(*), min(criado_em)
    into v_falhas, v_primeira_falha
  from private.tentativas_solicitacao_acesso
  where client_key = v_client_key
    and criado_em >= now() - interval '15 minutes';

  if v_falhas >= 5 then
    v_retry := greatest(1, ceil(extract(epoch from (v_primeira_falha + interval '15 minutes' - now())))::integer);
    return jsonb_build_object(
      'ok', false,
      'rate_limited', true,
      'retry_seconds', v_retry,
      'error', 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'
    );
  end if;

  if v_numero !~ '^ADMSBRG[0-9]{4,}$'
     or length(v_nome) < 3
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or length(v_contacto) < 9
     or p_data_nascimento is null then
    insert into private.tentativas_solicitacao_acesso (client_key) values (v_client_key);
    return jsonb_build_object('ok', false, 'error', 'Não foi possível validar os dados de membro.');
  end if;

  select m.* into v_membro
  from public.membros m
  where upper(regexp_replace(coalesce(m.numero_membro, ''), '[^A-Za-z0-9]', '', 'g')) = v_numero
    and lower(regexp_replace(btrim(coalesce(m.nome, '')), '\s+', ' ', 'g')) = v_nome
    and lower(btrim(coalesce(m.email, ''))) = v_email
    and right(regexp_replace(coalesce(m.telefone, ''), '[^0-9]', '', 'g'), 9) = right(v_contacto, 9)
    and m.data_nascimento = p_data_nascimento
    and lower(btrim(coalesce(m.estado, ''))) in ('ativo', 'activa', 'activo')
  limit 1;

  if v_membro.id is null then
    insert into private.tentativas_solicitacao_acesso (client_key) values (v_client_key);
    return jsonb_build_object('ok', false, 'error', 'Não foi possível validar os dados de membro. Confirme os dados com a Secretaria.');
  end if;

  delete from private.tentativas_solicitacao_acesso where client_key = v_client_key;

  if exists (select 1 from public.profiles p where p.membro_id = v_membro.id) then
    return jsonb_build_object('ok', false, 'error', 'Este membro já possui acesso. Use a recuperação de palavra-passe.');
  end if;

  if exists (
    select 1 from public.solicitacoes_acesso s
    where s.membro_id = v_membro.id and s.status = 'pendente'
  ) then
    return jsonb_build_object('ok', true, 'message', 'A sua solicitação já está em análise pela Secretaria.');
  end if;

  insert into public.solicitacoes_acesso (
    nome_completo, email, contacto, data_nascimento, status,
    membro_id, numero_membro, perfil_atribuido, dept_ids,
    decidido_por, decidido_em, auth_user_id
  ) values (
    v_membro.nome, v_membro.email, v_membro.telefone, v_membro.data_nascimento, 'pendente',
    v_membro.id, v_membro.numero_membro, null, '{}'::text[],
    null, null, null
  );

  return jsonb_build_object('ok', true, 'message', 'Solicitação enviada à Secretaria para aprovação.');
end;
$$;

revoke all on function public.solicitar_acesso_membro_v96(text,text,text,text,date) from public;
revoke all on function public.solicitar_acesso_membro_v96(text,text,text,text,date) from anon, authenticated;
grant execute on function public.solicitar_acesso_membro_v96(text,text,text,text,date) to anon, authenticated;

comment on function public.solicitar_acesso_membro_v96(text,text,text,text,date) is
  'Valida membro ativo e limita a cinco falhas por cliente em quinze minutos.';

commit;
