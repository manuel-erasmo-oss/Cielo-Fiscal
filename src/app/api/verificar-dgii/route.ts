import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { ENCABEZADO_CODIGO } from '@/lib/ocr-tipos'
import { RespuestaDGIIDesconocida, esUrlConsultaDGII, interpretarRespuestaDGII, type RespuestaDGII } from '@/lib/verificacion-dgii'

// POST /api/verificar-dgii — consulta en la DGII el estado de un comprobante
// electrónico a partir de la dirección de su código QR.
//
// Request:  encabezado x-codigo-acceso (el mismo código del OCR) + JSON
//           { "url": "<texto del QR>" }
// Response: 200 { estado, texto, datos } (ver `RespuestaDGII`)
//           400 la URL no es una consulta de la DGII · 401 código incorrecto
//           502 la DGII no respondió o respondió algo desconocido
//           503 el código de acceso no está configurado
//
// Se hace en el servidor y no en el navegador porque la DGII no permite que
// otra página web la consulte (CORS). No cuesta nada, pero igual se protege
// con el código de acceso para que el sitio no sea un intermediario abierto
// hacia la DGII. Solo consulta direcciones de la consulta de e-CF de la DGII
// (`esUrlConsultaDGII`), no sigue redirecciones y no guarda nada.

export const runtime = 'nodejs'
export const maxDuration = 30

const TIEMPO_MAXIMO_MS = 15_000
const TAMANO_MAXIMO_RESPUESTA = 500_000
const TAMANO_MAXIMO_URL = 2_000

function error(status: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status })
}

function codigoCorrecto(recibido: string, esperado: string): boolean {
  const h = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(h(recibido), h(esperado))
}

export async function POST(request: Request) {
  const codigoEsperado = process.env.OCR_CODIGO_ACCESO
  if (!codigoEsperado) return error(503, 'La verificación no está configurada en el servidor (falta OCR_CODIGO_ACCESO).')
  const codigo = request.headers.get(ENCABEZADO_CODIGO) ?? ''
  if (!codigo || !codigoCorrecto(codigo, codigoEsperado)) {
    return error(401, 'Código de acceso incorrecto. Revísalo en Configuración.')
  }

  let url: unknown
  try {
    url = ((await request.json()) as { url?: unknown }).url
  } catch {
    return error(400, 'La solicitud debe ser JSON con el campo `url`.')
  }
  if (typeof url !== 'string' || url.length > TAMANO_MAXIMO_URL || !esUrlConsultaDGII(url)) {
    return error(400, 'La dirección no es una consulta de comprobantes de la DGII.')
  }

  let html: string
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS), cache: 'no-store' })
    if (r.status !== 200) return error(502, `La DGII respondió con el código ${r.status}.`)
    html = await r.text()
    if (html.length > TAMANO_MAXIMO_RESPUESTA) return error(502, 'La respuesta de la DGII es demasiado grande.')
  } catch {
    return error(502, 'La DGII no respondió a tiempo. Intenta más tarde.')
  }

  try {
    return NextResponse.json<RespuestaDGII>(interpretarRespuestaDGII(html))
  } catch (e) {
    if (e instanceof RespuestaDGIIDesconocida) return error(502, 'La DGII respondió algo que el sistema no reconoce.')
    throw e
  }
}
