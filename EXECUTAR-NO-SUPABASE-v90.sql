-- ADMS Braga v90 — fluxo seguro de aprovação de acessos

begin;

alter table public.profiles
  add column if not exists must_set_password boolean not null default false;

alter table public.solicitacoes_acesso
  add column if not exists perfil_atribuido text,
  add column if not exists dept_ids text[] not null default '{}',
  add column if not exists decidido_por uuid references auth.users(id) on delete set null,
  add column if not exists decidido_em timestamptz,
  add column if not exists motivo_rejeicao text,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

update public.solicitacoes_acesso set status = 'pendente' where status is null;
alter table public.solicitacoes_acesso alter column status set default 'pendente';
alter table public.solicitacoes_acesso alter column status set not null;

alter table public.solicitacoes_acesso drop constraint if exists solicitacoes_acesso_status_v90_check;
alter table public.solicitacoes_acesso add constraint solicitacoes_acesso_status_v90_check
  check (status in ('pendente','aprovado','rejeitado'));

alter table public.solicitacoes_acesso drop constraint if exists solicitacoes_acesso_perfil_v90_check;
alter table public.solicitacoes_acesso add constraint solicitacoes_acesso_perfil_v90_check
  check (perfil_atribuido is null or perfil_atribuido in ('pastor','secretaria','tesouraria','lider','consulta'));

create index if not exists solicitacoes_acesso_status_created_v90_idx
  on public.solicitacoes_acesso(status, created_at desc);

alter table public.solicitacoes_acesso enable row level security;

drop policy if exists "solicitacoes_acesso_insert_public_v90" on public.solicitacoes_acesso;
create policy "solicitacoes_acesso_insert_public_v90" on public.solicitacoes_acesso
for insert to anon, authenticated
with check (
  status = 'pendente' and perfil_atribuido is null
  and coalesce(array_length(dept_ids, 1), 0) = 0
  and decidido_por is null and decidido_em is null and auth_user_id is null
);

drop policy if exists "solicitacoes_acesso_admin_select_v90" on public.solicitacoes_acesso;
create policy "solicitacoes_acesso_admin_select_v90" on public.solicitacoes_acesso
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo is true
      and (p.role in ('master','pastor','secretaria') or lower(coalesce(p.cargo,'')) like '%secretar%')
  )
);

revoke update, delete on table public.solicitacoes_acesso from anon, authenticated;
grant insert on table public.solicitacoes_acesso to anon, authenticated;
grant select on table public.solicitacoes_acesso to authenticated;

commit;
