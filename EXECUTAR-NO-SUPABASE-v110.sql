-- ADMS Braga v110 — execute uma única vez no SQL Editor.
-- Corrige o erro 23502 durante a importação de membro por código.

create or replace function public.adms_normalizar_nome_membro()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.nome := nullif(btrim(coalesce(
    new.nome,
    new.payload ->> 'nome',
    new.payload ->> 'nomeCompleto'
  )), '');

  if new.nome is null then
    raise exception using
      errcode = '23502',
      message = 'O nome completo do membro é obrigatório.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_adms_normalizar_nome_membro on public.membros;
create trigger trg_adms_normalizar_nome_membro
before insert or update on public.membros
for each row
execute function public.adms_normalizar_nome_membro();

revoke all on function public.adms_normalizar_nome_membro() from public;

select trigger_name, event_manipulation, action_timing
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'membros'
  and trigger_name = 'trg_adms_normalizar_nome_membro';

