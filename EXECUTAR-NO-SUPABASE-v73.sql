-- ADMS Braga v73
-- Secretaria: gestão transversal de todos os departamentos, incluindo Pastoral.
-- Execute integralmente no SQL Editor do Supabase.

begin;

-- Mantém compatibilidade com contas antigas gravadas como "secretaria" e
-- normaliza a Secretaria atual como utilizador Master.
update public.profiles
set role = 'master',
    cargo = case
      when coalesce(trim(cargo), '') = '' then 'Secretaria — Usuário Master'
      else cargo
    end
where lower(coalesce(role, '')) = 'secretaria'
   or lower(coalesce(cargo, '')) like '%secretar%';

-- As políticas são adicionais e permissivas: não retiram as proteções já
-- existentes e não concedem acesso a líderes, membros ou consulta.
drop policy if exists "departamentos_secretaria_select_v73" on public.departamentos;
create policy "departamentos_secretaria_select_v73"
on public.departamentos for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);

drop policy if exists "departamentos_secretaria_insert_v73" on public.departamentos;
create policy "departamentos_secretaria_insert_v73"
on public.departamentos for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);

drop policy if exists "departamentos_secretaria_update_v73" on public.departamentos;
create policy "departamentos_secretaria_update_v73"
on public.departamentos for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
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
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and (
        lower(coalesce(p.role, '')) in ('master', 'pastor', 'secretaria')
        or lower(coalesce(p.cargo, '')) like '%secretar%'
      )
  )
);

commit;

-- Verificação: deve devolver a conta da Secretaria como role master.
select id, nome, role, cargo, ativo
from public.profiles
where lower(coalesce(cargo, '')) like '%secretar%'
   or lower(coalesce(role, '')) = 'secretaria';
