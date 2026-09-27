-- ADMS Braga v59
-- A Secretaria passa a ser um perfil Master, inclusive nas rotinas
-- confidenciais do departamento Pastoral.

begin;

update public.profiles
set
  role = 'master',
  cargo = case
    when coalesce(trim(cargo), '') = '' then 'Secretaria — Usuário Master'
    else cargo
  end
where role = 'secretaria'
   or lower(coalesce(cargo, '')) like '%secretar%';

commit;

