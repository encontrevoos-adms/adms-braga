-- ADMS Braga v106 — estados administrativos e revogação de acessos.
begin;

alter table public.profiles
  add column if not exists access_status text not null default 'ativo',
  add column if not exists access_reason text,
  add column if not exists access_changed_at timestamptz,
  add column if not exists access_changed_by uuid references auth.users(id) on delete set null,
  add column if not exists access_expires_at timestamptz,
  add column if not exists sessions_revoked_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_access_status_v106_check;
alter table public.profiles
  add constraint profiles_access_status_v106_check
  check (access_status in ('ativo','suspenso','revogado'));

update public.profiles
set access_status = case when ativo is true then 'ativo' else 'suspenso' end
where access_changed_at is null;

create index if not exists profiles_access_status_v106_idx
  on public.profiles(access_status, access_expires_at);

comment on column public.profiles.access_status is
  'Estado administrativo da credencial; não altera nem elimina o cadastro do membro.';
comment on column public.profiles.sessions_revoked_at is
  'Instante a partir do qual sessões iniciadas anteriormente devem ser terminadas pelo portal.';

commit;

select access_status, count(*)
from public.profiles
group by access_status
order by access_status;
