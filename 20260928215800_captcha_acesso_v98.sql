-- ADMS Braga v98 — a validação pública passa exclusivamente pela Edge Function
-- solicitar-acesso, que confirma o Cloudflare Turnstile no servidor.

begin;

revoke all on function public.solicitar_acesso_membro_v96(text,text,text,text,date) from public;
revoke all on function public.solicitar_acesso_membro_v96(text,text,text,text,date) from anon, authenticated;
grant execute on function public.solicitar_acesso_membro_v96(text,text,text,text,date) to service_role;

comment on function public.solicitar_acesso_membro_v96(text,text,text,text,date) is
  'Uso exclusivo da Edge Function solicitar-acesso após validação Turnstile.';

commit;
