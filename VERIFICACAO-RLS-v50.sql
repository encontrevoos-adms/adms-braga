-- Consulta somente de leitura. Não altera a base de dados.
-- Execute no SQL Editor do Supabase e confirme que todas as tabelas privadas
-- apresentam rowsecurity = true e possuem políticas adequadas por perfil.

select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.policyname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public' and c.relkind = 'r'
group by n.nspname, c.relname, c.relrowsecurity
order by c.relname;
