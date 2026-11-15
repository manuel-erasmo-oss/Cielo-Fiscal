// Copia a public/ dos archivos que el navegador carga como estáticos para la
// captura por lotes: el "worker" de pdf.js y el módulo WebAssembly del lector
// de códigos QR. Corre después de `npm install` y antes de `dev` y de `build`
// (ver package.json), así siempre coinciden con las versiones instaladas y
// están presentes sea cual sea el comando con que se construya el sitio. Las copias no se versionan
// (.gitignore). Servirlos desde el propio sitio evita depender de un CDN
// externo para leer facturas.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(raiz, 'public'), { recursive: true })

const archivos = [
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
  ['node_modules/zxing-wasm/dist/reader/zxing_reader.wasm', 'zxing_reader.wasm'],
]
for (const [origen, destino] of archivos) {
  copyFileSync(join(raiz, origen), join(raiz, 'public', destino))
  console.log(`${destino} copiado a public/`)
}
