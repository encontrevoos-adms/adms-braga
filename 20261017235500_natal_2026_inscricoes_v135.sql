-- ADMS Braga v135 — inscrições públicas para a Ceia de Natal 2026
create table if not exists public.inscricoes_natal_2026 (
  id uuid primary key default gen_random_uuid(),
  referencia text not null unique,
  nome_responsavel text not null check (char_length(nome_responsavel) between 2 and 120),
  telefone text not null check (char_length(telefone) between 5 and 30),
  email text,
  total_participantes integer not null default 1 check (total_participantes between 1 and 30),
  nomes_agregado text,
  prato text not null check (char_length(prato) between 2 and 160),
  sobremesa text not null check (char_length(sobremesa) between 2 and 160),
  bebidas text not null check (char_length(bebidas) between 2 and 160),
  estado text not null default 'confirmada' check (estado in ('confirmada','cancelada','presente')),
  rgpd_aceite_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.inscricoes_natal_2026 enable row level security;
revoke all on table public.inscricoes_natal_2026 from anon, authenticated;
grant select, update, delete on table public.inscricoes_natal_2026 to authenticated;

drop policy if exists "gestores consultam inscricoes natal" on public.inscricoes_natal_2026;
create policy "gestores consultam inscricoes natal"
on public.inscricoes_natal_2026 for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and p.ativo = true
    and (p.role in ('master','pastor','secretaria') or lower(coalesce(p.cargo,'')) like '%secretar%')
));

drop policy if exists "gestores atualizam inscricoes natal" on public.inscricoes_natal_2026;
create policy "gestores atualizam inscricoes natal"
on public.inscricoes_natal_2026 for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.ativo = true
    and (p.role in ('master','pastor','secretaria') or lower(coalesce(p.cargo,'')) like '%secretar%')
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.ativo = true
    and (p.role in ('master','pastor','secretaria') or lower(coalesce(p.cargo,'')) like '%secretar%')
));

create index if not exists inscricoes_natal_2026_criado_em_idx on public.inscricoes_natal_2026 (criado_em desc);
create index if not exists inscricoes_natal_2026_estado_idx on public.inscricoes_natal_2026 (estado);
