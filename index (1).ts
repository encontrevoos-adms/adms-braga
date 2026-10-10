import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

function defaultApiKey(variable: 'SUPABASE_PUBLISHABLE_KEYS' | 'SUPABASE_SECRET_KEYS', legacy: 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY') {
  const raw = Deno.env.get(variable)
  if (raw) {
    try { const parsed = JSON.parse(raw) as Record<string, string>; if (parsed.default) return parsed.default } catch { if (raw.startsWith('sb_') || raw.startsWith('eyJ')) return raw }
  }
  const fallback = Deno.env.get(legacy)
  if (fallback) return fallback
  throw new Error(`${variable} não está disponível.`)
}

const allowedOrigins = new Set(['https://adms-braga.vercel.app','https://adms-braga-site.vercel.app','https://www.admsbraga.org','https://admsbraga.org'])
function cors(origin: string | null) {
  const allowed = origin && (allowedOrigins.has(origin) || /^http:\/\/localhost:\d+$/.test(origin)) ? origin : 'https://adms-braga.vercel.app'
  return {'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}
}
function json(origin: string | null, body: Record<string, unknown>, status=200) { return new Response(JSON.stringify(body),{status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8'}}) }

const roleConfig: Record<string,{role:string,cargo:string}> = {
  pastor:{role:'pastor',cargo:'Pastoral'}, secretaria:{role:'master',cargo:'Secretaria — Usuário Master'},
  tesouraria:{role:'tesouraria',cargo:'Tesouraria'}, lider:{role:'lider',cargo:'Liderança de departamento'}, consulta:{role:'consulta',cargo:'Consulta'},
}

Deno.serve(async req => {
  const origin=req.headers.get('origin')
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(origin)})
  if(req.method!=='POST')return json(origin,{ok:false,error:'Método não permitido.'},405)
  if(!origin||(!allowedOrigins.has(origin)&&!/^http:\/\/localhost:\d+$/.test(origin)))return json(origin,{ok:false,error:'Origem não autorizada.'},403)
  try {
    const url=Deno.env.get('SUPABASE_URL'),authorization=req.headers.get('Authorization')
    if(!url||!authorization)return json(origin,{ok:false,error:'Sessão administrativa inválida.'},401)
    const caller=createClient(url,defaultApiKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{autoRefreshToken:false,persistSession:false}})
    const admin=createClient(url,defaultApiKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),{auth:{autoRefreshToken:false,persistSession:false}})
    const {data:userData,error:userError}=await caller.auth.getUser()
    if(userError||!userData.user)return json(origin,{ok:false,error:'Sessão expirada. Entre novamente.'},401)
    const {data:callerProfile,error:profileError}=await admin.from('profiles').select('id,nome,role,ativo,cargo,access_status').eq('id',userData.user.id).single()
    const cargo=String(callerProfile?.cargo||'').toLowerCase()
    const authorized=callerProfile?.ativo===true&&callerProfile?.access_status!=='suspenso'&&callerProfile?.access_status!=='revogado'&&(['master','pastor','secretaria'].includes(callerProfile?.role)||cargo.includes('secretar'))
    if(profileError||!authorized)return json(origin,{ok:false,error:'Não tem autorização para gerir acessos.'},403)
    const body=await req.json(),action=String(body.action||'')

    if(['suspender','reativar','revogar','encerrar_sessoes'].includes(action)) {
      const targetUserId=String(body.targetUserId||''),reason=String(body.motivo||'').trim().slice(0,500),expiresAt=body.expiresAt?String(body.expiresAt):null
      if(!/^[0-9a-f-]{36}$/i.test(targetUserId))return json(origin,{ok:false,error:'Utilizador inválido.'},400)
      if(targetUserId===userData.user.id)return json(origin,{ok:false,error:'Não pode alterar o acesso da própria conta.'},409)
      const {data:target,error:targetError}=await admin.from('profiles').select('id,nome,role,cargo,ativo,access_status').eq('id',targetUserId).single()
      if(targetError||!target)return json(origin,{ok:false,error:'Perfil não encontrado.'},404)
      if(target.role==='master')return json(origin,{ok:false,error:'A conta institucional Master está protegida contra revogação por esta rotina.'},403)
      if(action!=='reativar'&&reason.length<5)return json(origin,{ok:false,error:'Informe um motivo com pelo menos cinco caracteres.'},400)
      const now=new Date().toISOString()
      let changes:Record<string,unknown>={},auditAction='',message=''
      if(action==='suspender') {
        let banDuration='876000h',expiry:string|null=null
        if(expiresAt){const end=new Date(expiresAt);if(!Number.isFinite(end.getTime())||end.getTime()<=Date.now())return json(origin,{ok:false,error:'A data final da suspensão deve estar no futuro.'},400);expiry=end.toISOString();banDuration=`${Math.max(60,Math.ceil((end.getTime()-Date.now())/1000))}s`}
        const {error}=await admin.auth.admin.updateUserById(targetUserId,{ban_duration:banDuration});if(error)throw error
        changes={ativo:false,access_status:'suspenso',access_reason:reason,access_changed_at:now,access_changed_by:userData.user.id,access_expires_at:expiry,sessions_revoked_at:now}
        auditAction=expiry?'Acesso suspenso temporariamente':'Acesso suspenso';message=expiry?'Acesso suspenso até à data indicada.':'Acesso suspenso por tempo indeterminado.'
      } else if(action==='reativar') {
        if(target.access_status==='revogado')return json(origin,{ok:false,error:'Um acesso revogado definitivamente não pode ser reativado por esta rotina.'},409)
        const {error}=await admin.auth.admin.updateUserById(targetUserId,{ban_duration:'none'});if(error)throw error
        changes={ativo:true,access_status:'ativo',access_reason:null,access_changed_at:now,access_changed_by:userData.user.id,access_expires_at:null}
        auditAction='Acesso reativado';message='Acesso reativado com sucesso.'
      } else if(action==='revogar') {
        const confirmation=String(body.confirmation||'');if(confirmation!=='REVOGAR')return json(origin,{ok:false,error:'Confirmação de revogação inválida.'},400)
        const {error}=await admin.auth.admin.updateUserById(targetUserId,{ban_duration:'876000h'});if(error)throw error
        changes={ativo:false,access_status:'revogado',access_reason:reason,access_changed_at:now,access_changed_by:userData.user.id,access_expires_at:null,sessions_revoked_at:now}
        auditAction='Acesso revogado definitivamente';message='Acesso revogado. O cadastro de membro e o histórico foram preservados.'
      } else {
        changes={sessions_revoked_at:now,access_changed_at:now,access_changed_by:userData.user.id,access_reason:reason}
        auditAction='Sessões remotas encerradas';message='As sessões anteriores foram marcadas para encerramento. O acesso permanece ativo.'
      }
      const {error:updateError}=await admin.from('profiles').update(changes).eq('id',targetUserId);if(updateError)throw updateError
      await admin.from('registo_atividade').insert({utilizador:callerProfile.nome||'Administração',perfil:callerProfile.role,modulo:'acesso',acao:auditAction,detalhes:`${target.nome} · ${reason||'Ação administrativa'}${expiresAt?` · até ${expiresAt}`:''}`})
      return json(origin,{ok:true,message})
    }

    const requestId=String(body.requestId||'')
    if(!['aprovar','rejeitar'].includes(action)||!/^[0-9a-f-]{36}$/i.test(requestId))return json(origin,{ok:false,error:'Pedido inválido.'},400)
    const {data:request,error:requestError}=await admin.from('solicitacoes_acesso').select('*').eq('id',requestId).single()
    if(requestError||!request)return json(origin,{ok:false,error:'Solicitação não encontrada.'},404)
    if((request.status||'pendente')!=='pendente')return json(origin,{ok:false,error:'Esta solicitação já foi decidida.'},409)
    if(action==='rejeitar') {
      const motivo=String(body.motivo||'').trim().slice(0,500);if(!motivo)return json(origin,{ok:false,error:'Informe o motivo da rejeição.'},400)
      const {error}=await admin.from('solicitacoes_acesso').update({status:'rejeitado',motivo_rejeicao:motivo,decidido_por:userData.user.id,decidido_em:new Date().toISOString()}).eq('id',requestId).eq('status','pendente');if(error)throw error
      await admin.from('registo_atividade').insert({utilizador:callerProfile.nome||'Administração',perfil:callerProfile.role,modulo:'acesso',acao:'Solicitação rejeitada',detalhes:`${request.nome_completo} · ${request.email}`})
      return json(origin,{ok:true,message:'Solicitação rejeitada e registada no histórico.'})
    }
    const requestedRole=String(body.profileRole||''),config=roleConfig[requestedRole]
    const deptIds=Array.isArray(body.deptIds)?[...new Set(body.deptIds.map((x:unknown)=>String(x)).filter(Boolean))].slice(0,30):[]
    if(!config)return json(origin,{ok:false,error:'Perfil de acesso inválido.'},400)
    if(requestedRole==='lider'&&!deptIds.length)return json(origin,{ok:false,error:'A Liderança exige pelo menos um departamento.'},400)
    if(!request.membro_id||!request.numero_membro)return json(origin,{ok:false,error:'Pedido sem vínculo de membro. Regularize o cadastro em Recursos Humanos antes de aprovar.'},409)
    const {data:member,error:memberError}=await admin.from('membros').select('id,numero_membro,nome,email,estado').eq('id',request.membro_id).eq('numero_membro',request.numero_membro).single()
    if(memberError||!member)return json(origin,{ok:false,error:'O membro vinculado não foi encontrado.'},409)
    if(!['ativo','activa','activo'].includes(String(member.estado||'').trim().toLowerCase()))return json(origin,{ok:false,error:'O cadastro do membro não está ativo em Recursos Humanos.'},409)
    const email=String(request.email||'').trim().toLowerCase();let authUser:any=null
    for(let page=1;page<=10&&!authUser;page++){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)throw error;authUser=data.users.find(u=>u.email?.toLowerCase()===email)||null;if(data.users.length<1000)break}
    let invited=false
    if(!authUser){const supplied=String(body.redirectTo||''),valid=/^https:\/\/(adms-braga(-site)?\.vercel\.app|(?:www\.)?admsbraga\.org)\/sistema(?:\?|$)/.test(supplied);const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:valid?supplied:'https://adms-braga.vercel.app/sistema?v=106',data:{nome:member.nome}});if(error)throw error;authUser=data.user;invited=true}
    if(!authUser)throw new Error('Não foi possível preparar a conta.')
    const {data:otherProfile}=await admin.from('profiles').select('id').eq('membro_id',member.id).neq('id',authUser.id).limit(1).maybeSingle();if(otherProfile)return json(origin,{ok:false,error:'Este membro já está ligado a outra conta.'},409)
    const {error:saveError}=await admin.from('profiles').upsert({id:authUser.id,nome:member.nome,role:config.role,ativo:true,cargo:config.cargo,dept_ids:deptIds,membro_id:member.id,must_set_password:invited,access_status:'ativo',access_reason:null,access_expires_at:null},{onConflict:'id'});if(saveError)throw saveError
    await admin.auth.admin.updateUserById(authUser.id,{ban_duration:'none'})
    const {error:decisionError}=await admin.from('solicitacoes_acesso').update({status:'aprovado',perfil_atribuido:requestedRole,dept_ids:deptIds,auth_user_id:authUser.id,decidido_por:userData.user.id,decidido_em:new Date().toISOString(),motivo_rejeicao:null}).eq('id',requestId).eq('status','pendente');if(decisionError)throw decisionError
    await admin.from('registo_atividade').insert({utilizador:callerProfile.nome||'Administração',perfil:callerProfile.role,modulo:'acesso',acao:'Acesso aprovado',detalhes:`${member.numero_membro} · ${member.nome} · ${requestedRole} · ${deptIds.join(', ')||'sem departamento específico'}`})
    return json(origin,{ok:true,message:invited?'Acesso aprovado. O convite foi enviado por e-mail.':'Acesso atualizado. O utilizador já possuía uma conta.'})
  } catch(error){console.error('gerir-solicitacoes-acesso:',error);return json(origin,{ok:false,error:'Não foi possível concluir a operação. Consulte os registos da função.'},500)}
})
