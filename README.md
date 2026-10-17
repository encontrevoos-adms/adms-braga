# Aplicação móvel — ADMS Braga

Esta pasta contém a camada móvel do Portal ADMS Braga. O site público, o portal
em produção e os ficheiros da raiz permanecem independentes.

## Princípio de segurança

- `scripts/prepare-web.mjs` apenas lê os ficheiros atuais do portal.
- A cópia móvel é escrita em `app-mobile/dist`, que não é enviada ao Git.
- Nenhum SQL, chave secreta ou credencial é incluído pela rotina.
- `android/` e `ios/` são projetos derivados e também ficam isolados.

## Preparar a aplicação

Requisitos: Node.js 22 ou superior. Para Android, Android Studio; para iOS,
macOS com Xcode.

```bash
cd app-mobile
npm install
npm run prepare:web
npx cap add android
npx cap add ios
npm run cap:sync
```

Use `npm run android` ou `npm run ios` para abrir o respetivo projeto nativo.

## Antes da publicação

1. Validar login, CAPTCHA, convite e recuperação de palavra-passe.
2. Configurar deep links e URLs autorizadas no Supabase.
3. Adicionar ícones, splash screen e assinatura das lojas.
4. Confirmar que respostas com dados pessoais ou financeiros não são guardadas
   em cache.
5. Executar testes em telemóvel e tablet antes de gerar o pacote de produção.

## Ligações de autenticação

O Android reconhece `admsbraga://auth/callback` e os endereços `/sistema` dos
domínios atuais. Antes do teste real, inclua a URL personalizada nas Redirect
URLs permitidas do Supabase. A secret key permanece exclusivamente no servidor.
O ficheiro `mobile-bridge.js` encaminha tanto o fluxo PKCE (`code`) como os
tokens legados no fragmento para o tratamento de autenticação já usado no portal.

## Atualizar a cópia móvel

Quando o portal for atualizado, execute novamente:

```bash
npm run prepare:web
npm run cap:sync
```

Isto regenera apenas a aplicação, sem modificar o portal publicado.
