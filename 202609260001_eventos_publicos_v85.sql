-- ADMS Braga v85 — publicação completa de eventos no site público.

alter table public.site_conteudos
  add column if not exists expirar_em timestamptz,
  add column if not exists imagem_url text,
  add column if not exists evento_id text;

create index if not exists site_conteudos_expiracao_idx
  on public.site_conteudos (ativo, status, publicar_em, expirar_em);

create index if not exists site_conteudos_evento_id_idx
  on public.site_conteudos (evento_id)
  where evento_id is not null;

comment on column public.site_conteudos.expirar_em is
  'Data e hora em que a publicação deixa de ser apresentada no site.';

comment on column public.site_conteudos.imagem_url is
  'Endereço público da imagem de capa da publicação.';

comment on column public.site_conteudos.evento_id is
  'Identificador do evento correspondente no Portal ADMS.';
