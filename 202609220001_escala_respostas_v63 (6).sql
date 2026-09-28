-- ADMS Braga v63 — confirmações individuais das escalas
-- Execute este ficheiro no SQL Editor do Supabase.

create table if not exists public.escala_respostas (
  id uuid primary key default gen_random_uuid(),
  escala_id text not null,
  departamento text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  resposta text not null default 'pendente' check (resposta in ('pendente','confirmado','indisponivel')),
  motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (escala_id,user_id)
);

create index if not exists escala_respostas_user_idx on public.escala_respostas(user_id);
create index if not exists escala_respostas_departamento_idx on public.escala_respostas(departamento);
alter table public.escala_respostas enable row level security;

drop policy if exists "escala_respostas_select" on public.escala_respostas;
create policy "escala_respostas_select" on public.escala_respostas
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo = true and (
      lower(p.role) in ('master','pastor','secretaria')
      or (lower(p.role) = 'lider' and departamento = any(coalesce(p.dept_ids,'{}'::text[])))
    )
  )
);

drop policy if exists "escala_respostas_insert_own" on public.escala_respostas;
create policy "escala_respostas_insert_own" on public.escala_respostas
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and nome = (select p.nome from public.profiles p where p.id = (select auth.uid()) and p.ativo = true)
);

drop policy if exists "escala_respostas_update_own" on public.escala_respostas;
create policy "escala_respostas_update_own" on public.escala_respostas
for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and nome = (select p.nome from public.profiles p where p.id = (select auth.uid()) and p.ativo = true)
);

grant select,insert,update on public.escala_respostas to authenticated;
revoke all on public.escala_respostas from anon;

comment on table public.escala_respostas is 'Confirmações individuais e protegidas das escalas ministeriais.';
