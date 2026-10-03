-- ADMS Braga v53 — numeração sequencial dos cartões de membro
alter table public.membros
  add column if not exists numero_membro text;

create sequence if not exists public.membros_numero_seq start 1;

create unique index if not exists membros_numero_membro_key
  on public.membros (numero_membro)
  where numero_membro is not null;

create or replace function public.adms_atribuir_numero_membro()
returns trigger
language plpgsql
security definer
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
for each row execute function public.adms_atribuir_numero_membro();

do $$
declare
  r record;
begin
  for r in select id from public.membros where numero_membro is null order by created_at, id loop
    update public.membros
       set numero_membro = 'ADMSBRG' || lpad(nextval('public.membros_numero_seq')::text, 4, '0')
     where id = r.id;
  end loop;
end $$;

