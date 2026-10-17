import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const allowedOrigins = new Set([
  'https://adms-braga.vercel.app',
  'https://adms-braga-site.vercel.app',
  'https://www.admsbraga.org',
  'https://admsbraga.org',
])

function cors(origin: string | null) {
  const allowed = origin && (allowedOrigins.has(origin) || /^http:\/\/localhost:\d+$/.test(origin))
    ? origin
    : 'https://adms-braga-site.vercel.app'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function response(origin: string | null, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function defaultSecretKey() {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    const keys = JSON.parse(raw) as Record<string, string>
    if (keys.default) return keys.default
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  throw new Error('A Secret Key do Supabase não está disponível.')
}

const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return response(origin, { ok: false, error: 'Método não permitido.' }, 405)

  try {
    const body = await req.json()
    if (clean(body.website, 200)) return response(origin, { ok: true, referencia: 'ADMS-NATAL' })

    const row = {
      referencia: `NATAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      nome_responsavel: clean(body.nome_responsavel, 120),
      telefone: clean(body.telefone, 30),
      email: clean(body.email, 160) || null,
      total_participantes: Number(body.total_participantes),
      nomes_agregado: clean(body.nomes_agregado, 1000) || null,
      prato: clean(body.prato, 160),
      sobremesa: clean(body.sobremesa, 160),
      bebidas: clean(body.bebidas, 160),
    }

    if (row.nome_responsavel.length < 2 || row.telefone.length < 5 || !Number.isInteger(row.total_participantes) || row.total_participantes < 1 || row.total_participantes > 30 || row.prato.length < 2 || row.sobremesa.length < 2 || row.bebidas.length < 2 || body.rgpd !== true) {
      return response(origin, { ok: false, error: 'Preencha todos os campos obrigatórios.' }, 400)
    }
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      return response(origin, { ok: false, error: 'O endereço de e-mail não é válido.' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('SUPABASE_URL não está disponível.')
    const admin = createClient(supabaseUrl, defaultSecretKey(), { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await admin.from('inscricoes_natal_2026').insert(row)
    if (error) throw error

    return response(origin, { ok: true, referencia: row.referencia, message: 'Inscrição confirmada.' }, 201)
  } catch (error) {
    console.error('public-christmas-registration:', error)
    return response(origin, { ok: false, error: 'Não foi possível confirmar a inscrição agora.' }, 500)
  }
})
