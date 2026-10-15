-- ADMS Braga v129 — cadastro protegido do Ministério Infantil (Kids)
-- Execute uma única vez no SQL Editor do Supabase.

begin;

create sequence if not exists public.kids_numero_seq start 1;

create table if not exists public.kids_criancas (
  id uuid primary key default gen_random_uuid(),
  numero_kids text not null unique default ('ADMSKID' || lpad(nextval('public.kids_numero_seq')::text, 4, '0')),
  nome text not null,
  data_nascimento date not null,
  genero text,
  vinculo text not null default 'crianca_congregacao'
    check (vinculo in ('crianca_congregacao','visitante','dependente')),
  turma text not null,
  data_entrada date not null default current_date,
  alergias text,
  restricoes_alimentares text,
  medicacao_emergencia text,
  necessidades_especiais text,
  orientacoes_cuidado text,
  autoriza_foto boolean not null default false,
  autoriza_atividade_externa boolean not null default false,
  autoriza_atendimento_emergencia boolean not null default false,
  consentimento_em date,
  consentimento_por text,
  observacoes_autorizacao text,
  estado text not null default 'ativo' check (estado in ('ativo','inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.kids_responsaveis (
  id uuid primary key default gen_random_uuid(),
  crianca_id uuid not null references public.kids_criancas(id) on delete cascade,
  membro_id uuid references public.membros(id) on delete set null,
  nome text not null,
  parentesco text not null,
  telefone text not null,
  email text,
  principal boolean not null default false,
  autorizado_retirada boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists kids_criancas_estado_nome_idx on public.kids_criancas(estado, nome);
create index if not exists kids_criancas_nascimento_idx on public.kids_criancas(data_nascimento);
create index if not exists kids_responsaveis_crianca_idx on public.kids_responsaveis(crianca_id);
create unique index if not exists kids_responsavel_principal_idx
  on public.kids_responsaveis(crianca_id) where principal is true;

alter table public.kids_criancas enable row level security;
alter table public.kids_responsaveis enable row level security;

grant select, insert, update on table public.kids_criancas to authenticated;
grant select, insert, update, delete on table public.kids_responsaveis to authenticated;
grant usage, select on sequence public.kids_numero_seq to authenticated;

drop policy if exists "kids_criancas_select_v129" on public.kids_criancas;
create policy "kids_criancas_select_v129" on public.kids_criancas
for select to authenticated using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo is true
      and (
        lower(coalesce(p.role,'')) in ('master','pastor','secretaria')
        or lower(coalesce(p.cargo,'')) like '%secretar%'
        or (lower(coalesce(p.role,'')) = 'lider' and 'kids' = any(coalesce(p.dept_ids,'{}'::text[])))
      )
  )
);

drop policy if exists "kids_criancas_insert_v129" on public.kids_criancas;
create policy "kids_criancas_insert_v129" on public.kids_criancas
for insert to authenticated with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo is true
      and (
        lower(coalesce(p.role,'')) in ('master','secretaria')
        or lower(coalesce(p.cargo,'')) like '%secretar%'
        or (lower(coalesce(p.role,'')) = 'lider' and 'kids' = any(coalesce(p.dept_ids,'{}'::text[])))
      )
  )
);

drop policy if exists "kids_criancas_update_v129" on public.kids_criancas;
create policy "kids_criancas_update_v129" on public.kids_criancas
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo is true
      and (
        lower(coalesce(p.role,'')) in ('master','secretaria')
        or lower(coalesce(p.cargo,'')) like '%secretar%'
        or (lower(coalesce(p.role,'')) = 'lider' and 'kids' = any(coalesce(p.dept_ids,'{}'::text[])))
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo is true
      and (
        lower(coalesce(p.role,'')) in ('master','secretaria')
        or lower(coalesce(p.cargo,'')) like '%secretar%'
        or (lower(coalesce(p.role,'')) = 'lider' and 'kids' = any(coalesce(p.dept_ids,'{}'::text[])))
      )
  )
);

drop policy if exists "kids_responsaveis_select_v129" on public.kids_responsaveis;
create policy "kids_responsaveis_select_v129" on public.kids_responsaveis
for select to authenticated using (
  exists (select 1 from public.kids_criancas c where c.id = crianca_id)
);

drop policy if exists "kids_responsaveis_insert_v129" on public.kids_responsaveis;
create policy "kids_responsaveis_insert_v129" on public.kids_responsaveis
for insert to authenticated with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo is true
      and (
        lower(coalesce(p.role,'')) in ('master','secretaria')
        or lower(coalesce(p.cargo,'')) like '%secretar%'
        or (lower(coalesce(p.role,'')) = 'lider' and 'kids' = any(coalesce(p.dept_ids,'{}'::text[])))
      )
  )
);

drop policy if exists "kids_responsaveis_update_v129" on public.kids_responsaveis;
create policy "kids_responsaveis_update_v129" on public.kids_responsaveis
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo is true
      and (
        lower(coalesce(p.role,'')) in ('master','secretaria')
        or lower(coalesce(p.cargo,'')) like '%secretar%'
        or (lower(coalesce(p.role,'')) = 'lider' and 'kids' = any(coalesce(p.dept_ids,'{}'::text[])))
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo is true
      and (
        lower(coalesce(p.role,'')) in ('master','secretaria')
        or lower(coalesce(p.cargo,'')) like '%secretar%'
        or (lower(coalesce(p.role,'')) = 'lider' and 'kids' = any(coalesce(p.dept_ids,'{}'::text[])))
      )
  )
);

drop policy if exists "kids_responsaveis_delete_v129" on public.kids_responsaveis;
create policy "kids_responsaveis_delete_v129" on public.kids_responsaveis
for delete to authenticated using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo is true
      and (
        lower(coalesce(p.role,'')) in ('master','secretaria')
        or lower(coalesce(p.cargo,'')) like '%secretar%'
        or (lower(coalesce(p.role,'')) = 'lider' and 'kids' = any(coalesce(p.dept_ids,'{}'::text[])))
      )
  )
);

comment on table public.kids_criancas is 'Cadastro infantil protegido; não cria conta no portal nem número de membro adulto.';
comment on table public.kids_responsaveis is 'Adultos autorizados e contactos vinculados às crianças do Ministério Kids.';

commit;

-- Verificação: deve devolver duas linhas com RLS ativo.
select relname as tabela, relrowsecurity as rls_ativo
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('kids_criancas','kids_responsaveis')
order by relname;
