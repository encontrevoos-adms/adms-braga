-- ADMS Braga v87 — gestor editorial completo do site público.
-- Copie TODO este conteúdo para o SQL Editor do Supabase e clique em Run.

alter table public.site_conteudos
  add column if not exists ordem integer not null default 0,
  add column if not exists status text not null default 'publicado',
  add column if not exists publicar_em timestamptz,
  add column if not exists expirar_em timestamptz,
  add column if not exists imagem_url text,
  add column if not exists evento_id text,
  add column if not exists destaque boolean not null default false,
  add column if not exists created_by uuid,
  add column if not exists autor_nome text,
  add column if not exists editor_nome text;

alter table public.site_conteudos
  drop constraint if exists site_conteudos_status_check;

alter table public.site_conteudos
  add constraint site_conteudos_status_check
  check (status in ('rascunho','publicado','agendado','arquivado','expirado'));

update public.site_conteudos
set created_by = coalesce(created_by, updated_by),
    autor_nome = coalesce(autor_nome, 'Conteúdo existente'),
    editor_nome = coalesce(editor_nome, autor_nome, 'Conteúdo existente')
where created_by is null
   or autor_nome is null
   or editor_nome is null;

create index if not exists site_conteudos_editorial_v87_idx
  on public.site_conteudos
  (ativo, status, destaque desc, ordem, publicar_em, expirar_em);

create index if not exists site_conteudos_evento_id_idx
  on public.site_conteudos (evento_id)
  where evento_id is not null;

comment on column public.site_conteudos.destaque is
  'Define se o conteúdo recebe prioridade visual e editorial no site público.';

comment on column public.site_conteudos.autor_nome is
  'Nome apresentado do utilizador que criou o conteúdo.';

comment on column public.site_conteudos.editor_nome is
  'Nome apresentado do último utilizador que alterou o conteúdo.';
