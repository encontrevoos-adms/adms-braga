-- ADMS Braga v96 — acesso ao portal obrigatoriamente ligado a um membro ativo.
-- A solicitação pública passa por uma RPC controlada e nunca consulta diretamente
-- a tabela de membros. A resposta é deliberadamente genérica para evitar enumeração.

begin;

alter table public.solicitacoes_acesso
  add column if not exists membro_id uuid references public.membros(id) on delete restrict,
  add column if not exists numero_membro text;

create index if not exists solicitacoes_acesso_membro_v96_idx
  on public.solicitacoes_acesso (membro_id, status, created_at desc)
  where membro_id is not null;

create unique index if not exists profiles_membro_id_v96_key
  on public.profiles (membro_id)
  where membro_id is not null;

alter table public.solicitacoes_acesso drop constraint if exists solicitacoes_acesso_numero_v96_check;
alter table public.solicitacoes_acesso add constraint solicitacoes_acesso_numero_v96_check
  check (numero_membro is null or numero_membro ~ '^ADMSBRG[0-9]{4,}$');

-- O formulário público não volta a escrever diretamente na tabela.
drop policy if exists "solicitacoes_acesso_insert_public_v90" on public.solicitacoes_acesso;
revoke insert on table public.solicitacoes_acesso from anon, authenticated;

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
begin
  if v_numero !~ '^ADMSBRG[0-9]{4,}$'
     or length(v_nome) < 3
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or length(v_contacto) < 9
     or p_data_nascimento is null then
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
    return jsonb_build_object('ok', false, 'error', 'Não foi possível validar os dados de membro. Confirme os dados com a Secretaria.');
  end if;

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
grant execute on function public.solicitar_acesso_membro_v96(text,text,text,text,date) to anon, authenticated;

comment on function public.solicitar_acesso_membro_v96(text,text,text,text,date) is
  'Valida cinco dados de um membro ativo e cria uma solicitação de acesso sem expor o cadastro.';

commit;

-- Resultado de conferência: esta lista deve ficar vazia antes de publicar o portal v96.
select p.id, p.nome, p.role, p.cargo
from public.profiles p
where p.ativo is true and p.membro_id is null
order by p.nome;
