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

function defaultSecretKey() {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      if (parsed.default) return parsed.default
    } catch {
      if (raw.startsWith('sb_') || raw.startsWith('eyJ')) return raw
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  throw new Error('A chave de servidor do Supabase não está disponível.')
}

async function verifyTurnstile(token: string, remoteIp: string) {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) throw new Error('TURNSTILE_SECRET_KEY não está configurada.')
  const form = new URLSearchParams({ secret, response: token })
  if (remoteIp) form.set('remoteip', remoteIp)
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  if (!response.ok) return false
  const result = await response.json() as { success?: boolean; hostname?: string }
  const hostname = String(result.hostname || '').toLowerCase()
  const trustedHost = hostname === 'localhost' || allowedOrigins.has(`https://${hostname}`)
  return result.success === true && trustedHost
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
    const captchaToken = String(body.captchaToken || '')
    const remoteIp = String(req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    if (!captchaToken || !(await verifyTurnstile(captchaToken, remoteIp))) {
      return json(origin, { ok: false, error: 'A validação de segurança expirou ou não foi aceite. Tente novamente.' }, 400)
    }

    const numero = String(body.numero || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    const nome = String(body.nome || '').trim().slice(0, 160)
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254)
    const contacto = String(body.contacto || '').trim().slice(0, 40)
    const dataNascimento = String(body.data_nascimento || '')
    if (!/^ADMSBRG\d{4,}$/.test(numero) || nome.length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || contacto.length < 9 || !/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) {
      return json(origin, { ok: false, error: 'Não foi possível validar os dados apresentados.' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('SUPABASE_URL não está disponível.')
    const admin = createClient(supabaseUrl, defaultSecretKey(), {
      global: { headers: { 'x-forwarded-for': remoteIp || 'desconhecido', 'user-agent': req.headers.get('user-agent') || 'sem-agente' } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await admin.rpc('solicitar_acesso_membro_v96', {
      p_numero_membro: numero,
      p_nome: nome,
      p_email: email,
      p_contacto: contacto,
      p_data_nascimento: dataNascimento,
    })
    if (error) throw error

    if (data?.rate_limited) return json(origin, data, 429)
    if (!data?.ok) {
      return json(origin, { ok: false, error: 'Não foi possível validar os dados apresentados. Confirme-os com a Secretaria.' }, 400)
    }
    return json(origin, {
      ok: true,
      message: 'Se os dados forem elegíveis, a solicitação será analisada pela Secretaria.',
    })
  } catch (error) {
    console.error('solicitar-acesso:', error)
    return json(origin, { ok: false, error: 'Não foi possível concluir a solicitação agora.' }, 500)
  }
})
