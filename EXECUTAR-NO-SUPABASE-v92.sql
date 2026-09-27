-- ADMS Braga v92 — execute uma única vez no SQL Editor

alter table public.profiles
  add column if not exists membro_id uuid references public.membros(id) on delete set null;

create index if not exists profiles_membro_id_v92_idx
  on public.profiles (membro_id)
  where membro_id is not null;

update public.profiles p
set membro_id = (
  select m.id
  from public.membros m
  where lower(btrim(m.email)) = lower(btrim(u.email))
  order by m.created_at nulls last, m.id
  limit 1
)
from auth.users u
where p.id = u.id
  and p.membro_id is null
  and u.email is not null
  and exists (
    select 1 from public.membros m
    where lower(btrim(m.email)) = lower(btrim(u.email))
  );

alter table public.membros enable row level security;

drop policy if exists "membros_select_proprio_cartao_v92" on public.membros;
create policy "membros_select_proprio_cartao_v92"
on public.membros
for select
to authenticated
using (
  id = (
    select p.membro_id
    from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
  )
);

grant select on public.membros to authenticated;

