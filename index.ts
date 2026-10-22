import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_ORIGINS = new Set([
  "https://adms-braga.vercel.app",
  "https://adms-braga-site.vercel.app",
  "https://www.admsbraga.org",
  "https://admsbraga.org",
])

function secretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS")
  if (modern) {
    const keys = JSON.parse(modern) as Record<string, string>
    if (keys.default) return keys.default
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (legacy) return legacy
  throw new Error("A chave administrativa do Supabase não está disponível.")
}

function requestOrigin(req: Request) {
  return req.headers.get("origin") || ""
}

function originAllowed(origin: string) {
  return ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function cors(req: Request) {
  const origin = requestOrigin(req)
  return {
    "Access-Control-Allow-Origin": originAllowed(origin) ? origin : "https://adms-braga-site.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  }
}

function json(req: Request, body: Record<string, unknown>, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      ...extra,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max + 1)
}

function clientIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    "unknown"
  ).trim()
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function allowedByRateLimit(
  admin: ReturnType<typeof createClient>,
  req: Request,
  type: "prayer" | "contact",
  identity: string,
) {
  const ipHash = await digest(clientIp(req))
  const identityHash = await digest(identity)
  const [{ data: ipAllowed, error: ipError }, { data: identityAllowed, error: identityError }] =
    await Promise.all([
      admin.rpc("consume_rate_limit", {
        p_key: `public:${type}:ip:${ipHash}`,
        p_window_seconds: 3600,
        p_limit: 5,
      }),
      admin.rpc("consume_rate_limit", {
        p_key: `public:${type}:identity:${identityHash}`,
        p_window_seconds: 600,
        p_limit: 2,
      }),
    ])

  if (ipError || identityError) {
    console.error("public-submit rate-limit:", ipError || identityError)
    throw new Error("RATE_LIMIT_UNAVAILABLE")
  }
  return Boolean(ipAllowed && identityAllowed)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) })
  if (req.method !== "POST") {
    return json(req, { ok: false, error: "Método não permitido." }, 405, { Allow: "POST, OPTIONS" })
  }

  const origin = requestOrigin(req)
  if (origin && !originAllowed(origin)) {
    return json(req, { ok: false, error: "Origem não autorizada." }, 403)
  }
  if (Number(req.headers.get("content-length") || 0) > 12_000) {
    return json(req, { ok: false, error: "Pedido demasiado grande." }, 413)
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const type = body.type === "prayer" ? "prayer" : body.type === "contact" ? "contact" : null
    if (!type) return json(req, { ok: false, error: "Tipo de pedido inválido." }, 400)

    // Campo invisível: robôs recebem uma resposta neutra sem qualquer gravação.
    if (text(body.website, 200)) return json(req, { ok: true }, 202)

    const name = text(body.nome, 100)
    const email = text(body.email, 160).toLowerCase()
    const phone = text(body.contacto, 30)
    if (name.length < 2 || name.length > 100 || (email && !EMAIL_RE.test(email))) {
      return json(req, { ok: false, error: "Verifique o nome e o endereço de e-mail." }, 400)
    }

    const admin = createClient(SUPABASE_URL, secretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const identity = `${email}|${phone}|${name.toLocaleLowerCase("pt-PT")}`

    if (type === "prayer") {
      const pedido = text(body.pedido, 3000)
      if (pedido.length < 5 || pedido.length > 3000) {
        return json(req, { ok: false, error: "Escreva o seu pedido de oração." }, 400)
      }
      if (!(await allowedByRateLimit(admin, req, type, identity))) {
        return json(
          req,
          { ok: false, error: "Muitos envios. Aguarde dez minutos antes de tentar novamente." },
          429,
          { "Retry-After": "600" },
        )
      }

      const { error } = await admin.from("pedidos_oracao").insert({
        nome: name,
        email: email || null,
        contacto: phone || null,
        pedido,
        confidencial: body.confidencial === true,
        status: "novo",
      })
      if (error) {
        console.error("public-submit prayer insert:", error.code, error.message)
        return json(req, { ok: false, error: "Não foi possível guardar o pedido agora." }, 500)
      }
      return json(req, { ok: true, message: "Pedido de oração recebido." }, 201)
    }

    const horarios = new Set(["Manhã", "Tarde", "Noite", "Qualquer horário"])
    const melhorHorario = text(body.melhor_horario, 30) || "Qualquer horário"
    const mensagem = text(body.mensagem, 2000)
    const origem = text(body.origem, 80) || "site_novo"
    if (
      phone.length < 5 ||
      phone.length > 30 ||
      !horarios.has(melhorHorario) ||
      body.rgpd_aceite !== true
    ) {
      return json(req, { ok: false, error: "Verifique o contacto e a autorização RGPD." }, 400)
    }
    if (!(await allowedByRateLimit(admin, req, type, identity))) {
      return json(
        req,
        { ok: false, error: "Muitos envios. Aguarde dez minutos antes de tentar novamente." },
        429,
        { "Retry-After": "600" },
      )
    }

    const { error } = await admin.from("novos_contactos").insert({
      nome: name,
      email: email || null,
      contacto: phone,
      melhor_horario: melhorHorario,
      mensagem: mensagem || null,
      origem,
      rgpd_aceite: true,
      status: "novo",
    })
    if (error) {
      console.error("public-submit contact insert:", error.code, error.message)
      return json(req, { ok: false, error: "Não foi possível guardar o contacto agora." }, 500)
    }
    return json(req, { ok: true, message: "Contacto recebido." }, 201)
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMIT_UNAVAILABLE") {
      return json(req, { ok: false, error: "Serviço temporariamente indisponível." }, 503)
    }
    console.error("public-submit:", error)
    return json(req, { ok: false, error: "Não foi possível concluir o envio agora." }, 500)
  }
})
