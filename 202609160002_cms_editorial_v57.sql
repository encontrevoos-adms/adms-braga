-- ADMS Braga v57 — fluxo editorial do site público.
-- Executar no Supabase SQL Editor antes de utilizar agendamento e histórico.

alter table public.site_conteudos
  add column if not exists ordem integer not null default 0,
  add column if not exists status text not null default 'publicado',
  add column if not exists publicar_em timestamptz;

alter table public.site_conteudos
  drop constraint if exists site_conteudos_status_check;

alter table public.site_conteudos
  add constraint site_conteudos_status_check
  check (status in ('rascunho','publicado','agendado'));

update public.site_conteudos
set status = case when ativo then 'publicado' else 'rascunho' end
where publicar_em is null;

create index if not exists site_conteudos_publicacao_idx
  on public.site_conteudos (status, ativo, publicar_em, ordem);

create table if not exists public.site_conteudos_historico (
  id bigint generated always as identity primary key,
  chave text not null,
  acao text not null check (acao in ('INSERT','UPDATE','DELETE')),
  dados_anteriores jsonb,
  dados_novos jsonb,
  alterado_por uuid,
  alterado_em timestamptz not null default now()
);

create index if not exists site_conteudos_historico_chave_idx
  on public.site_conteudos_historico (chave, alterado_em desc);

alter table public.site_conteudos_historico enable row level security;

drop policy if exists "historico_site_leitura_autenticada" on public.site_conteudos_historico;
create policy "historico_site_leitura_autenticada"
  on public.site_conteudos_historico for select
  to authenticated
  using (true);

revoke insert, update, delete on public.site_conteudos_historico from anon, authenticated;
grant select on public.site_conteudos_historico to authenticated;

create or replace function public.registar_historico_site_conteudos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.site_conteudos_historico
    (chave, acao, dados_anteriores, dados_novos, alterado_por)
  values
    (coalesce(new.chave, old.chave), tg_op,
     case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
     case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
     auth.uid());
  return coalesce(new, old);
end;
$$;

drop trigger if exists site_conteudos_historico_trigger on public.site_conteudos;
create trigger site_conteudos_historico_trigger
after insert or update or delete on public.site_conteudos
for each row execute function public.registar_historico_site_conteudos();
