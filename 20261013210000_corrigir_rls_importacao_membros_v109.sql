-- ADMS Braga v109 — restaura a gestão administrativa segura de membros.
-- Mantém o membro comum limitado ao próprio cartão (política da v92) e
-- permite que Master, Pastor e Secretaria administrem os Recursos Humanos.

alter table public.membros enable row level security;

grant select, insert, update, delete on table public.membros to authenticated;

drop policy if exists "membros_admin_select_v109" on public.membros;
create policy "membros_admin_select_v109"
on public.membros
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);

drop policy if exists "membros_admin_insert_v109" on public.membros;
create policy "membros_admin_insert_v109"
on public.membros
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);

drop policy if exists "membros_admin_update_v109" on public.membros;
create policy "membros_admin_update_v109"
on public.membros
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);

drop policy if exists "membros_admin_delete_v109" on public.membros;
create policy "membros_admin_delete_v109"
on public.membros
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);
