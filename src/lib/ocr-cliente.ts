import { leerCodigoOCR } from '@/lib/config-local'
import { trocearSiEsLarga } from '@/lib/lote/tramos'
import {
  ENCABEZADO_CODIGO,
  MIME_PDF,
  TAMANO_MAXIMO_BYTES,
  esMimeImagen,
  type ErrorOCR,
  type ResultadoOCR,
} from '@/lib/ocr-tipos'
import type { TipoDocumento } from '@/types'

// Lado del navegador del OCR: prepara el archivo y llama a `/api/ocr`.

export class OCRError extends Error {
  constructor(
    mensaje: string,
    // true cuando el problema es el código de acceso (falta o es incorrecto):
    // la pantalla ofrece ir a Configuración en vez de reintentar.
    readonly esDeCodigo = false,
    // true cuando el servidor no tiene configurada la lectura con IA: no
    // tiene sentido seguir intentando con las demás páginas de un lote.
    readonly sinServicio = false,
  ) {
    super(mensaje)
    this.name = 'OCRError'
  }
}

export function esArchivoSoportado(archivo: File): boolean {
  return archivo.type === MIME_PDF || esMimeImagen(archivo.type)
}

// Lado más largo, en píxeles, al que se reduce una foto pesada. Suficiente
// para leer la letra pequeña de una factura tamaño carta.
const LADO_MAXIMO_PX = 2200

// Las fotos de celular suelen pesar más que el tope de subida. Se
// redimensionan y recomprimen a JPEG en el navegador; los PDF no se tocan.
async function reducirImagen(archivo: File): Promise<File> {
  const bitmap = await createImageBitmap(archivo)
  try {
    const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d no disponible')
    // Fondo blanco: un PNG con transparencia quedaría negro al pasar a JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('no se pudo recomprimir la imagen')
    return new File([blob], archivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}

// Devuelve el archivo listo para subir, o lanza OCRError si no hay forma de
// dejarlo dentro del tope.
export async function prepararArchivo(archivo: File): Promise<File> {
  if (!esArchivoSoportado(archivo)) {
    throw new OCRError('Tipo de archivo no soportado. Sube una imagen (JPEG, PNG, WebP) o un PDF.')
  }
  if (archivo.size <= TAMANO_MAXIMO_BYTES) return archivo
  if (archivo.type === MIME_PDF) {
    throw new OCRError('El PDF supera los 4 MB. Divídelo o expórtalo con menor resolución.')
  }
  let reducido: File
  try {
    reducido = await reducirImagen(archivo)
  } catch {
    throw new OCRError('La imagen supera los 4 MB y no se pudo reducir en este navegador.')
  }
  if (reducido.size > TAMANO_MAXIMO_BYTES) {
    throw new OCRError('La imagen sigue superando los 4 MB después de reducirla.')
  }
  return reducido
}

export interface ContextoCliente {
  // RNC o cédula del cliente: con él el servidor deduce si es compra o venta.
  rncCliente?: string
  // A qué se dedica: orienta la clasificación de la compra (costo, gasto, activo).
  actividad?: string
  // Modelo de IA (uno de `MODELOS_OCR`). Sin indicar, el que use el servidor
  // por defecto. Lo usa la herramienta "Comparar modelos".
  modelo?: string
  // Actividad económica del proveedor según el padrón de RNC de la DGII:
  // pista para el tipo de bienes y servicios.
  actividadProveedor?: string
}

// Lee una factura con IA. `tipo` es el que se asume si la factura no deja
// saber si es compra o venta. Una imagen muy larga (un recibo de caja) se
// envía partida en tramos.
export async function extraerFactura(archivo: File, tipo: TipoDocumento, contexto: ContextoCliente = {}): Promise<ResultadoOCR> {
  const codigo = leerCodigoOCR()
  if (!codigo) {
    throw new OCRError('Falta el código de acceso al OCR. Escríbelo en Configuración.', true)
  }

  const partes = await trocearSiEsLarga(archivo)
  const form = new FormData()
  if (partes.length > 1) {
    if (partes.reduce((s, p) => s + p.size, 0) > TAMANO_MAXIMO_BYTES) {
      throw new OCRError('El recibo es demasiado grande para leerlo con IA. Captúralo a mano.')
    }
    partes.forEach((parte, i) => form.append('archivo', parte, `tramo-${i + 1}.jpg`))
  } else {
    form.set('archivo', await prepararArchivo(archivo))
  }
  form.set('tipo', tipo)
  if (contexto.rncCliente) form.set('rncCliente', contexto.rncCliente)
  if (contexto.actividad?.trim()) form.set('actividad', contexto.actividad.trim())
  if (contexto.modelo) form.set('modelo', contexto.modelo)
  if (contexto.actividadProveedor) form.set('actividadProveedor', contexto.actividadProveedor)

  let respuesta: Response
  try {
    respuesta = await fetch('/api/ocr', {
      method: 'POST',
      headers: { [ENCABEZADO_CODIGO]: codigo },
      body: form,
    })
  } catch {
    throw new OCRError('No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.')
  }

  let cuerpo: ResultadoOCR | ErrorOCR | null = null
  try {
    cuerpo = await respuesta.json()
  } catch {
    // Respuesta sin JSON (p. ej. un error de la plataforma): se trata abajo.
  }
  if (!respuesta.ok || !cuerpo || 'error' in cuerpo) {
    const mensaje = cuerpo && 'error' in cuerpo ? cuerpo.error : `El OCR falló (error ${respuesta.status}).`
    // 401: código incorrecto. 503: el servidor no tiene la lectura configurada.
    throw new OCRError(mensaje, respuesta.status === 401, respuesta.status === 503)
  }
  return cuerpo
}
