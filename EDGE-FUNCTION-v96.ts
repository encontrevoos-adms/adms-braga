// ADMS Braga v96 — aprovação de acessos exclusivamente para membros validados.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
const H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8'}
const out=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:H})
function apiKey(modern:string,legacy:string){const raw=Deno.env.get(modern);if(raw){try{const p=JSON.parse(raw);if(p.default)return p.default}catch{if(raw.startsWith('sb_')||raw.startsWith('eyJ'))return raw}}const old=Deno.env.get(legacy);if(old)return old;throw new Error(`Chave ${modern}/${legacy} indisponível.`)}
const roles:Record<string,{role:string,cargo:string}>={
 pastor:{role:'pastor',cargo:'Pastoral'},secretaria:{role:'master',cargo:'Secretaria — Usuário Master'},
 tesouraria:{role:'tesouraria',cargo:'Tesouraria'},lider:{role:'lider',cargo:'Liderança de departamento'},consulta:{role:'consulta',cargo:'Consulta'}
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:H})
 if(req.method!=='POST')return out({ok:false,error:'Método não permitido.'},405)
 try{
  const url=Deno.env.get('SUPABASE_URL'),authorization=req.headers.get('Authorization')
  if(!url||!authorization)return out({ok:false,error:'Sessão administrativa inválida.'},401)
  const caller=createClient(url,apiKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}})
  const admin=createClient(url,apiKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}})
  const{data:auth,error:authError}=await caller.auth.getUser()
  if(authError||!auth.user)return out({ok:false,error:'Sessão expirada. Entre novamente.'},401)
  const{data:profile,error:profileError}=await admin.from('profiles').select('id,nome,role,ativo,cargo').eq('id',auth.user.id).single()
  const authorized=profile?.ativo===true&&(['master','pastor','secretaria'].includes(profile.role)||String(profile.cargo||'').toLowerCase().includes('secretar'))
  if(profileError||!authorized)return out({ok:false,error:'Não tem autorização para gerir acessos.'},403)
  const body=await req.json(),action=String(body.action||''),requestId=String(body.requestId||'')
  if(!['aprovar','rejeitar'].includes(action)||!/^[0-9a-f-]{36}$/i.test(requestId))return out({ok:false,error:'Pedido inválido.'},400)
  const{data:request,error:requestError}=await admin.from('solicitacoes_acesso').select('*').eq('id',requestId).single()
  if(requestError||!request)return out({ok:false,error:'Solicitação não encontrada.'},404)
  if((request.status||'pendente')!=='pendente')return out({ok:false,error:'Esta solicitação já foi decidida.'},409)
  if(action==='rejeitar'){
   const motivo=String(body.motivo||'').trim().slice(0,500);if(!motivo)return out({ok:false,error:'Informe o motivo da rejeição.'},400)
   const{error}=await admin.from('solicitacoes_acesso').update({status:'rejeitado',motivo_rejeicao:motivo,decidido_por:auth.user.id,decidido_em:new Date().toISOString()}).eq('id',requestId).eq('status','pendente')
   if(error)throw error
   await admin.from('registo_atividade').insert({utilizador:profile.nome||'Administração',perfil:profile.role,modulo:'acesso',acao:'Solicitação rejeitada',detalhes:`${request.nome_completo} · ${request.email}`})
   return out({ok:true,message:'Solicitação rejeitada e registada no histórico.'})
  }
  const requestedRole=String(body.profileRole||''),config=roles[requestedRole]
  const deptIds=Array.isArray(body.deptIds)?[...new Set(body.deptIds.map(String).filter(Boolean))].slice(0,30):[]
  if(!config)return out({ok:false,error:'Perfil de acesso inválido.'},400)
  if(requestedRole==='lider'&&!deptIds.length)return out({ok:false,error:'A Liderança exige pelo menos um departamento.'},400)
  if(!request.membro_id||!request.numero_membro)return out({ok:false,error:'Pedido sem vínculo de membro. Regularize o cadastro em Recursos Humanos antes de aprovar.'},409)
  const{data:member,error:memberError}=await admin.from('membros').select('id,numero_membro,nome,email,telefone,data_nascimento,estado').eq('id',request.membro_id).eq('numero_membro',request.numero_membro).single()
  if(memberError||!member)return out({ok:false,error:'O membro vinculado não foi encontrado.'},409)
  if(!['ativo','activa','activo'].includes(String(member.estado||'').trim().toLowerCase()))return out({ok:false,error:'O cadastro do membro não está ativo em Recursos Humanos.'},409)
  const email=String(request.email||'').trim().toLowerCase();if(!email)return out({ok:false,error:'E-mail inválido.'},400)
  let authUser:any=null
  for(let page=1;page<=10&&!authUser;page++){const{data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)throw error;authUser=data.users.find(u=>u.email?.toLowerCase()===email)||null;if(data.users.length<1000)break}
  let invited=false
  if(!authUser){
   const supplied=String(body.redirectTo||''),valid=/^https:\/\/[a-z0-9-]+\.vercel\.app\/sistema(?:\?|$)/i.test(supplied)||/^https:\/\/(?:www\.)?admsbraga\.org\/sistema(?:\?|$)/i.test(supplied)
   const{data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:valid?supplied:'https://adms-braga.vercel.app/sistema?v=96',data:{nome:member.nome}})
   if(error)throw error;authUser=data.user;invited=true
  }
  if(!authUser)throw new Error('Não foi possível preparar a conta.')
  const{data:otherProfile}=await admin.from('profiles').select('id').eq('membro_id',member.id).neq('id',authUser.id).limit(1).maybeSingle()
  if(otherProfile)return out({ok:false,error:'Este membro já está ligado a outra conta. A Secretaria deve regularizar o vínculo.'},409)
  const{error:saveError}=await admin.from('profiles').upsert({id:authUser.id,nome:member.nome,role:config.role,ativo:true,cargo:config.cargo,dept_ids:deptIds,membro_id:member.id,must_set_password:invited},{onConflict:'id'})
  if(saveError)throw saveError
  const{error:decisionError}=await admin.from('solicitacoes_acesso').update({status:'aprovado',perfil_atribuido:requestedRole,dept_ids:deptIds,auth_user_id:authUser.id,decidido_por:auth.user.id,decidido_em:new Date().toISOString(),motivo_rejeicao:null}).eq('id',requestId).eq('status','pendente')
  if(decisionError)throw decisionError
  await admin.from('registo_atividade').insert({utilizador:profile.nome||'Administração',perfil:profile.role,modulo:'acesso',acao:'Acesso aprovado',detalhes:`${member.numero_membro} · ${member.nome} · ${requestedRole} · ${deptIds.join(', ')||'sem departamento específico'}`})
  return out({ok:true,message:invited?'Acesso aprovado. O convite foi enviado por e-mail.':'Acesso atualizado. O utilizador já possuía uma conta.'})
 }catch(error){console.error('gerir-solicitacoes-acesso:',error);return out({ok:false,error:'Não foi possível concluir a operação. Consulte os registos da função.'},500)}
})
