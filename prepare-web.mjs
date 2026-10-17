import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const projectDir = resolve(appDir, '..')
const outputDir = join(appDir, 'dist')

// A aplicação é gerada a partir do portal existente. Nenhum ficheiro do site é
// alterado, movido ou eliminado por este processo.
const runtimeExtensions = new Set([
  '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif',
  '.ico', '.woff', '.woff2', '.ttf', '.mp3', '.mp4', '.webm'
])
const mobileExcludedFiles = new Set(['vercel.json'])

await rm(outputDir, { recursive: true, force: true })
await mkdir(join(outputDir, 'sistema'), { recursive: true })

const portalSource = join(projectDir, 'sistema.html')
const originalPortal = await readFile(portalSource, 'utf8')
const bodyEnd = originalPortal.lastIndexOf('</body>')
if (bodyEnd < 0) throw new Error('O portal não contém a etiqueta final </body>.')
const mobilePortal = `${originalPortal.slice(0, bodyEnd)}  <script src="/mobile-bridge.js"></script>\n${originalPortal.slice(bodyEnd)}`
await writeFile(join(outputDir, 'index.html'), mobilePortal)
await writeFile(join(outputDir, 'sistema.html'), mobilePortal)
await writeFile(join(outputDir, 'sistema', 'index.html'), mobilePortal)
await copyFile(join(appDir, 'mobile-bridge.js'), join(outputDir, 'mobile-bridge.js'))

for (const entry of await readdir(projectDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue
  if (mobileExcludedFiles.has(entry.name)) continue
  const extension = extname(entry.name).toLowerCase()
  if (!runtimeExtensions.has(extension)) continue
  await copyFile(join(projectDir, entry.name), join(outputDir, entry.name))
}

// O manifesto do app é derivado do manifesto web, mas começa sempre na raiz
// local do pacote. Assim, nenhuma versão antiga na query string é transportada.
const manifestPath = join(outputDir, 'manifest-sistema.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.id = '/'
manifest.start_url = '/'
manifest.scope = '/'
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

console.log('Portal preparado em app-mobile/dist sem alterar o site atual.')
