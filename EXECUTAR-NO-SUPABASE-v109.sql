-- ADMS Braga v109 — execute uma única vez no SQL Editor do Supabase.
-- Corrige a importação e a gestão de membros pelo Usuário Master/Secretaria.

alter table public.membros enable row level security;

grant select, insert, update, delete on table public.membros to authenticated;

drop policy if exists "membros_admin_select_v109" on public.membros;
create policy "membros_admin_select_v109"
on public.membros for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);

drop policy if exists "membros_admin_insert_v109" on public.membros;
create policy "membros_admin_insert_v109"
on public.membros for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);

drop policy if exists "membros_admin_update_v109" on public.membros;
create policy "membros_admin_update_v109"
on public.membros for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);

drop policy if exists "membros_admin_delete_v109" on public.membros;
create policy "membros_admin_delete_v109"
on public.membros for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);

-- Verificação: as quatro políticas abaixo devem aparecer no resultado.
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'membros'
  and policyname like 'membros_admin_%_v109'
order by policyname;
