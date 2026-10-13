-- ADMS Braga v111 — restaura a numeração automática ADMSBRG0001...

create sequence if not exists public.membros_numero_seq start with 1 increment by 1;

create unique index if not exists membros_numero_membro_key
  on public.membros (numero_membro)
  where numero_membro is not null;

-- Alinha a sequência ao maior número já atribuído, evitando duplicações.
with atual as (
  select coalesce(max((substring(numero_membro from '([0-9]+)$'))::bigint), 0) as maior
  from public.membros
  where numero_membro ~ '^ADMSBRG[0-9]+$'
)
select setval(
  'public.membros_numero_seq',
  greatest(maior, 1),
  maior > 0
)
from atual;

create or replace function public.adms_atribuir_numero_membro()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.numero_membro is null or btrim(new.numero_membro) = '' then
    new.numero_membro := 'ADMSBRG' || lpad(nextval('public.membros_numero_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_adms_atribuir_numero_membro on public.membros;
create trigger trg_adms_atribuir_numero_membro
before insert on public.membros
for each row
execute function public.adms_atribuir_numero_membro();

revoke all on function public.adms_atribuir_numero_membro() from public;

