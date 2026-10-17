(() => {
  const Capacitor = window.Capacitor
  const App = Capacitor?.Plugins?.App
  if (!Capacitor?.isNativePlatform?.() || !App) return

  const deliverAuthUrl = (rawUrl) => {
    if (!rawUrl) return

    try {
      const url = new URL(rawUrl)
      const isAuthCallback = url.protocol === 'admsbraga:' &&
        url.hostname === 'auth' && url.pathname.startsWith('/callback')
      const isPortalLink = url.protocol === 'https:' &&
        ['adms-braga.vercel.app', 'adms-braga-site.vercel.app', 'admsbraga.org', 'www.admsbraga.org'].includes(url.hostname) &&
        url.pathname.startsWith('/sistema')

      if (!isAuthCallback && !isPortalLink) return

      // O Supabase pode devolver code na query string ou tokens no fragmento.
      // Ambos são entregues à mesma página que já trata a autenticação web.
      const destination = `/sistema/${url.search}${url.hash}`
      if (`${location.pathname}${location.search}${location.hash}` !== destination) {
        location.replace(destination)
      }
    } catch (error) {
      console.warn('ADMS Braga: ligação móvel inválida.', error)
    }
  }

  App.addListener('appUrlOpen', ({ url }) => deliverAuthUrl(url))
  App.getLaunchUrl().then((result) => deliverAuthUrl(result?.url)).catch(() => {})
})()
