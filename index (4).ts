import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const allowedOrigins = new Set([
  'https://adms-braga.vercel.app',
  'https://adms-braga-site.vercel.app',
  'https://admsbraga.org',
  'https://www.admsbraga.org',
])

function cors(origin: string | null) {
  const allowed = origin && (allowedOrigins.has(origin) || /^http:\/\/localhost:\d+$/.test(origin))
    ? origin
    : 'https://adms-braga.vercel.app'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info',
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

function authFailure(error: { code?: string; message?: string; status?: number } | null) {
  const code = String(error?.code || '').toLowerCase()
  const message = String(error?.message || '').toLowerCase()
  if (code === 'captcha_failed' || message.includes('captcha')) {
    return { code: 'captcha_failed', error: 'A validação de segurança não foi aceite pelo Supabase. Confirme a Secret Key do Turnstile em Authentication → Attack Protection.' }
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return { code: 'email_not_confirmed', error: 'O e-mail da conta Master ainda não foi confirmado.' }
  }
  if (code === 'user_banned' || message.includes('banned')) {
    return { code: 'user_banned', error: 'A conta Master encontra-se temporariamente bloqueada.' }
  }
  if (code.includes('rate') || message.includes('rate limit') || error?.status === 429) {
    return { code: 'rate_limited', error: 'Foram realizadas demasiadas tentativas. Aguarde alguns minutos e tente novamente.' }
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return { code: 'invalid_credentials', error: 'A palavra-passe da conta Master está incorreta.' }
  }
  return { code: code || 'auth_failed', error: 'O Supabase recusou a autenticação da conta Master.' }
}

function defaultKey(variable: 'SUPABASE_PUBLISHABLE_KEYS' | 'SUPABASE_SECRET_KEYS', legacy: string) {
  const raw = Deno.env.get(variable)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      if (parsed.default) return parsed.default
    } catch {
      if (raw.startsWith('sb_') || raw.startsWith('eyJ')) return raw
    }
  }
  const fallback = Deno.env.get(legacy)
  if (fallback) return fallback
  throw new Error(`${variable} não está disponível.`)
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json(origin, { ok: false, error: 'Método não permitido.' }, 405)
  if (!origin || (!allowedOrigins.has(origin) && !/^http:\/\/localhost:\d+$/.test(origin))) {
    return json(origin, { ok: false, error: 'Origem não autorizada.' }, 403)
  }

  try {
    const body = await req.json()
    const usuario = String(body.usuario || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const password = String(body.password || '')
    const captchaToken = String(body.captchaToken || '')
    if (usuario !== 'usuariomaster' || !password || !captchaToken) {
      return json(origin, { ok: false, error: 'Credenciais ou validação de segurança inválidas.' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('SUPABASE_URL não está disponível.')
    const publishableKey = defaultKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
    const secretKey = defaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id,nome,cargo,role,ativo')
      .eq('role', 'master')
      .eq('ativo', true)
      .limit(20)
    if (profileError) throw profileError
    const candidates = (profiles || []).sort((a, b) => {
      const score = (p: typeof a) => /usu[aá]rio\s*master/i.test(String(p.nome || '')) ? 0 : /secretar/i.test(String(p.cargo || '')) ? 1 : 2
      return score(a) - score(b)
    })
    const institutional = candidates[0]
    if (!institutional) return json(origin, { ok: false, error: 'Credenciais ou validação de segurança inválidas.' }, 401)

    const { data: authData, error: authLookupError } = await admin.auth.admin.getUserById(institutional.id)
    if (authLookupError || !authData.user?.email) throw authLookupError || new Error('Conta Master sem e-mail de autenticação.')

    const authClient = createClient(supabaseUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: sessionData, error: signInError } = await authClient.auth.signInWithPassword({
      email: authData.user.email,
      password,
      options: { captchaToken },
    })
    if (signInError || !sessionData.session) {
      const failure = authFailure(signInError)
      console.error('login-master auth recusada:', {
        code: signInError?.code,
        status: signInError?.status,
        message: signInError?.message,
        profileId: institutional.id,
      })
      return json(origin, { ok: false, ...failure }, signInError?.status === 429 ? 429 : 401)
    }

    return json(origin, {
      ok: true,
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_at: sessionData.session.expires_at,
    })
  } catch (error) {
    console.error('login-master:', error)
    return json(origin, { ok: false, error: 'Não foi possível concluir o acesso agora.' }, 500)
  }
})
