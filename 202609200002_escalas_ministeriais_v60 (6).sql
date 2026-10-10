-- ADMS Braga v60 — escalas ministeriais
-- Ativa a gestão de escalas nos seis departamentos prioritários.

begin;

update public.departamentos
set permite_escala = true,
    updated_at = now()
where id in ('louvor', 'danca', 'jovens', 'kids', 'homens', 'mulheres');

commit;

