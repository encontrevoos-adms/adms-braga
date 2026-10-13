-- ADMS Braga v110 — garante o nome na importação de cadastros recebidos por link.

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

