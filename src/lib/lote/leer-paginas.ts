import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import { esMimeImagen, MIME_PDF } from '@/lib/ocr-tipos'
import { cajaDeContenido } from '@/lib/lote/recorte'

// Captura por lotes, lado del navegador: convierte los archivos subidos (un
// PDF de muchas páginas, o varias fotos) en páginas sueltas — una imagen JPEG
// por página — y busca en cada una el código QR del comprobante electrónico.
// Todo ocurre en el navegador: nada se envía a ningún servidor.

// Tope de páginas por lote (decisión del usuario, ver CLAUDE.md "Costo y
// límites"): es por tiempo y confiabilidad, no por costo.
export const MAXIMO_PAGINAS_LOTE = 100

export class LoteError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'LoteError'
  }
}

export interface PaginaLeida {
  // Posición dentro del lote, desde 1.
  numero: number
  archivoNombre: string
  // Página dentro de su archivo, desde 1 (siempre 1 para una foto).
  paginaEnArchivo: number
  imagen: Blob
  ancho: number
  alto: number
  // Texto del primer código QR encontrado, o null.
  textoQr: string | null
}

// Resolución a la que se dibuja cada página de un PDF. 200 puntos por
// pulgada es la del escáner de la muestra real y basta para leer el QR.
const PPP = 200
// Lado mayor máximo de una página dibujada: evita agotar la memoria con una
// página enorme, pero deja enteras las tiras largas de los recibos de caja
// (hasta ~4,400 px en la muestra real).
const LADO_MAXIMO_PX = 6000

// El lector de QR (ZXing compilado a WebAssembly) se carga desde este mismo
// sitio, no desde un CDN (ver scripts/copiar-estaticos.mjs).
let lectorPreparado = false
function prepararLector() {
  if (lectorPreparado) return
  prepareZXingModule({
    overrides: { locateFile: (ruta: string, prefijo: string) => (ruta.endsWith('.wasm') ? '/zxing_reader.wasm' : prefijo + ruta) },
  })
  lectorPreparado = true
}

async function leer(datos: ImageData): Promise<string | null> {
  const [codigo] = await readBarcodes(datos, {
    formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: false, tryDownscale: true, maxNumberOfSymbols: 1,
  })
  return codigo?.text || null
}

// Busca un QR en la página: primero en la imagen entera y, si no aparece, por
// ventanas solapadas ampliadas al doble — en una hoja escaneada el QR ocupa
// una fracción pequeña y a veces solo se lee al acercarse.
// Medido con el PDF real de 58 páginas (ver CLAUDE.md, "Primera muestra
// real"): en el navegador leyó 27 códigos y todo el lote tardó 17.5 s. Solo
// con la imagen entera, sin ventanas, se quedaba en 19. Otro lector (jsQR)
// leyó 20 y tardó 110 s. Las páginas restantes no tienen QR o lo tienen
// tapado por un sello o una marca.
export async function buscarQr(canvas: HTMLCanvasElement): Promise<string | null> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  prepararLector()
  const { width: w, height: h } = canvas

  const entera = await leer(ctx.getImageData(0, 0, w, h))
  if (entera) return entera

  const AMPLIACION = 2
  const lado = Math.min(w, h, 800)
  const paso = Math.max(1, Math.floor(lado / 2))
  const ampliada = document.createElement('canvas')
  const ctxAmpliada = ampliada.getContext('2d', { willReadFrequently: true })
  if (!ctxAmpliada) return null
  for (let y = 0; y < h; y += paso) {
    for (let x = 0; x < w; x += paso) {
      const tw = Math.min(lado, w - x)
      const th = Math.min(lado, h - y)
      if (tw < lado / 3 || th < lado / 3) continue // sobrante ya cubierto por la ventana anterior
      ampliada.width = tw * AMPLIACION
      ampliada.height = th * AMPLIACION
      ctxAmpliada.imageSmoothingEnabled = true
      ctxAmpliada.drawImage(canvas, x, y, tw, th, 0, 0, ampliada.width, ampliada.height)
      const texto = await leer(ctxAmpliada.getImageData(0, 0, ampliada.width, ampliada.height))
      if (texto) return texto
    }
  }
  return null
}

// Copia de la página sin los márgenes blancos (ver `recorte.ts`): la imagen
// que se guarda y se envía a la IA. El QR se busca en la página entera.
function sinMargenes(canvas: HTMLCanvasElement, destino: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas
  const caja = cajaDeContenido(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
  if (!caja) return canvas
  destino.width = caja.ancho
  destino.height = caja.alto
  const ctxDestino = destino.getContext('2d')
  if (!ctxDestino) return canvas
  ctxDestino.drawImage(canvas, caja.x, caja.y, caja.ancho, caja.alto, 0, 0, caja.ancho, caja.alto)
  return destino
}

function aJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new LoteError('No se pudo preparar la imagen de una página.'))), 'image/jpeg', 0.85)
  })
}

// Cede el control para que la pantalla pueda pintar el progreso.
const respirar = () => new Promise<void>(resolve => setTimeout(resolve, 0))

type DocumentoPdf = Awaited<ReturnType<typeof import('pdfjs-dist')['getDocument']>['promise']>

async function abrirPdf(archivo: File): Promise<{ pdf: DocumentoPdf; cerrar: () => void }> {
  const pdfjs = await import('pdfjs-dist')
  // El worker se sirve como archivo estático (ver scripts/copiar-worker-pdf.mjs).
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const tarea = pdfjs.getDocument({ data: await archivo.arrayBuffer() })
  try {
    return { pdf: await tarea.promise, cerrar: () => void tarea.destroy() }
  } catch {
    throw new LoteError(`No se pudo abrir "${archivo.name}". Puede estar dañado o protegido con contraseña.`)
  }
}

// Lee todos los archivos y entrega cada página a `alLeer` en cuanto está
// lista. `cancelado` permite interrumpir (por ejemplo, si se cierra la pantalla).
export async function leerPaginas(
  archivos: readonly File[],
  alLeer: (pagina: PaginaLeida, total: number) => void,
  cancelado: () => boolean = () => false,
): Promise<void> {
  for (const a of archivos) {
    if (a.type !== MIME_PDF && !esMimeImagen(a.type)) {
      throw new LoteError(`"${a.name}" no es un PDF ni una imagen (JPEG, PNG, WebP).`)
    }
  }

  // Primero se cuentan las páginas, para rechazar el lote antes de procesar nada.
  const fuentes: { archivo: File; pdf: DocumentoPdf | null; paginas: number; cerrar: () => void }[] = []
  const canvas = document.createElement('canvas')
  const recortado = document.createElement('canvas')
  let numero = 0
  try {
    for (const archivo of archivos) {
      const abierto = archivo.type === MIME_PDF ? await abrirPdf(archivo) : null
      fuentes.push({ archivo, pdf: abierto?.pdf ?? null, paginas: abierto ? abierto.pdf.numPages : 1, cerrar: abierto?.cerrar ?? (() => {}) })
    }
    const total = fuentes.reduce((s, f) => s + f.paginas, 0)
    if (total === 0) throw new LoteError('Los archivos no tienen páginas.')
    if (total > MAXIMO_PAGINAS_LOTE) {
      throw new LoteError(`El lote tiene ${total} páginas y el máximo es ${MAXIMO_PAGINAS_LOTE}. Divídelo en varios archivos.`)
    }

    for (const { archivo, pdf, paginas } of fuentes) {
      for (let p = 1; p <= paginas; p++) {
        if (cancelado()) return
        if (pdf) {
          const pagina = await pdf.getPage(p)
          const base = pagina.getViewport({ scale: 1 })
          const escala = Math.min(PPP / 72, LADO_MAXIMO_PX / Math.max(base.width, base.height))
          const viewport = pagina.getViewport({ scale: escala })
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          await pagina.render({ canvas, viewport }).promise
          pagina.cleanup()
        } else {
          const bitmap = await createImageBitmap(archivo).catch(() => {
            throw new LoteError(`No se pudo abrir la imagen "${archivo.name}".`)
          })
          const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(bitmap.width, bitmap.height))
          canvas.width = Math.round(bitmap.width * escala)
          canvas.height = Math.round(bitmap.height * escala)
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) throw new LoteError('Este navegador no puede procesar imágenes.')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          bitmap.close()
        }
        numero += 1
        const final = sinMargenes(canvas, recortado)
        alLeer({
          numero,
          archivoNombre: archivo.name,
          paginaEnArchivo: p,
          imagen: await aJpeg(final),
          ancho: final.width,
          alto: final.height,
          textoQr: await buscarQr(canvas).catch(() => null),
        }, total)
        await respirar()
      }
    }
  } finally {
    for (const { cerrar } of fuentes) cerrar()
  }
}
