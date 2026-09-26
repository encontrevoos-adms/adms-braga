import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const allowedOrigins = new Set([
  'https://adms-braga.vercel.app',
  'https://adms-braga-site.vercel.app',
  'https://www.admsbraga.org',
  'https://admsbraga.org',
])

function cors(origin: string | null) {
  const allowed = origin && (allowedOrigins.has(origin) || /^http:\/\/localhost:\d+$/.test(origin)) ? origin : 'https://adms-braga.vercel.app'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(origin: string | null, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

const roleConfig: Record<string, { role: string; cargo: string }> = {
  pastor: { role: 'pastor', cargo: 'Pastoral' },
  secretaria: { role: 'master', cargo: 'Secretaria — Usuário Master' },
  tesouraria: { role: 'tesouraria', cargo: 'Tesouraria' },
  lider: { role: 'lider', cargo: 'Liderança de departamento' },
  consulta: { role: 'consulta', cargo: 'Consulta' },
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json(origin, { ok: false, error: 'Método não permitido.' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authorization = req.headers.get('Authorization')
    if (!supabaseUrl || !anonKey || !serviceKey || !authorization) return json(origin, { ok: false, error: 'Sessão administrativa inválida.' }, 401)

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: userData, error: userError } = await callerClient.auth.getUser()
    if (userError || !userData.user) return json(origin, { ok: false, error: 'Sessão expirada. Entre novamente.' }, 401)

    const { data: callerProfile, error: profileError } = await admin.from('profiles').select('id,nome,role,ativo,cargo').eq('id', userData.user.id).single()
    const callerCargo = String(callerProfile?.cargo || '').toLowerCase()
    const authorized = callerProfile?.ativo === true && (['master', 'pastor', 'secretaria'].includes(callerProfile.role) || callerCargo.includes('secretar'))
    if (profileError || !authorized) return json(origin, { ok: false, error: 'Não tem autorização para gerir acessos.' }, 403)

    const body = await req.json()
    const action = String(body.action || '')
    const requestId = String(body.requestId || '')
    if (!['aprovar', 'rejeitar'].includes(action) || !/^[0-9a-f-]{36}$/i.test(requestId)) return json(origin, { ok: false, error: 'Pedido inválido.' }, 400)

    const { data: accessRequest, error: requestError } = await admin.from('solicitacoes_acesso').select('*').eq('id', requestId).single()
    if (requestError || !accessRequest) return json(origin, { ok: false, error: 'Solicitação não encontrada.' }, 404)
    if ((accessRequest.status || 'pendente') !== 'pendente') return json(origin, { ok: false, error: 'Esta solicitação já foi decidida.' }, 409)

    if (action === 'rejeitar') {
      const motivo = String(body.motivo || '').trim().slice(0, 500)
      if (!motivo) return json(origin, { ok: false, error: 'Informe o motivo da rejeição.' }, 400)
      const { error } = await admin.from('solicitacoes_acesso').update({ status: 'rejeitado', motivo_rejeicao: motivo, decidido_por: userData.user.id, decidido_em: new Date().toISOString() }).eq('id', requestId).eq('status', 'pendente')
      if (error) throw error
      await admin.from('registo_atividade').insert({ utilizador: callerProfile.nome || 'Administração', perfil: callerProfile.role, modulo: 'acesso', acao: 'Solicitação rejeitada', detalhes: `${accessRequest.nome_completo} · ${accessRequest.email}` })
      return json(origin, { ok: true, message: 'Solicitação rejeitada e registada no histórico.' })
    }

    const requestedRole = String(body.profileRole || '')
    const config = roleConfig[requestedRole]
    const deptIds = Array.isArray(body.deptIds) ? [...new Set(body.deptIds.map((x: unknown) => String(x)).filter(Boolean))].slice(0, 30) : []
    if (!config) return json(origin, { ok: false, error: 'Perfil de acesso inválido.' }, 400)
    if (requestedRole === 'lider' && deptIds.length === 0) return json(origin, { ok: false, error: 'A Liderança exige pelo menos um departamento.' }, 400)

    const email = String(accessRequest.email || '').trim().toLowerCase()
    let authUser: { id: string; email?: string } | null = null
    for (let page = 1; page <= 10 && !authUser; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      authUser = data.users.find((u) => u.email?.toLowerCase() === email) || null
      if (data.users.length < 1000) break
    }

    let invited = false
    if (!authUser) {
      const suppliedRedirect = String(body.redirectTo || '')
      const redirectTo = /^https:\/\/(adms-braga(-site)?\.vercel\.app|(?:www\.)?admsbraga\.org)\/sistema(?:\?|$)/.test(suppliedRedirect)
        ? suppliedRedirect
        : 'https://adms-braga.vercel.app/sistema?v=90'
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { nome: accessRequest.nome_completo } })
      if (error) throw error
      authUser = data.user
      invited = true
    }
    if (!authUser) throw new Error('Não foi possível preparar a conta do utilizador.')

    const { error: upsertError } = await admin.from('profiles').upsert({
      id: authUser.id,
      nome: accessRequest.nome_completo,
      role: config.role,
      ativo: true,
      cargo: config.cargo,
      dept_ids: deptIds,
      must_set_password: invited,
    }, { onConflict: 'id' })
    if (upsertError) throw upsertError

    const { error: updateError } = await admin.from('solicitacoes_acesso').update({
      status: 'aprovado', perfil_atribuido: requestedRole, dept_ids: deptIds,
      auth_user_id: authUser.id, decidido_por: userData.user.id, decidido_em: new Date().toISOString(), motivo_rejeicao: null,
    }).eq('id', requestId).eq('status', 'pendente')
    if (updateError) throw updateError

    await admin.from('registo_atividade').insert({ utilizador: callerProfile.nome || 'Administração', perfil: callerProfile.role, modulo: 'acesso', acao: 'Acesso aprovado', detalhes: `${accessRequest.nome_completo} · ${requestedRole} · ${deptIds.join(', ') || 'sem departamento específico'}` })
    return json(origin, { ok: true, message: invited ? 'Acesso aprovado. O convite foi enviado por e-mail.' : 'Acesso atualizado. O utilizador já possuía uma conta e pode entrar ou recuperar a palavra-passe.' })
  } catch (error) {
    console.error('gestao-acessos:', error)
    return json(origin, { ok: false, error: 'Não foi possível concluir a operação. Consulte os registos da função.' }, 500)
  }
})
