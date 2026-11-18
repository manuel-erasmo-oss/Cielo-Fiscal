import { parseFechaLocal, soloDigitos } from '@/lib/utils'
import { loEmiteElComprador } from '@/lib/dgii-formatos'

// Código QR de un comprobante fiscal electrónico (e-CF).
//
// Verificado decodificando facturas reales (ver CLAUDE.md, "Primera muestra
// real"): el QR lleva una URL de consulta de la DGII con estos parámetros:
//   RncEmisor, RncComprador, ENCF, FechaEmision (DD-MM-AAAA), MontoTotal,
//   FechaFirma, CodigoSeguridad
// El nombre del emisor llega con distintas mayúsculas (RncEmisor, RNCEmisor,
// rncemisor) y MontoTotal a veces trae coma de miles, así que los nombres se
// comparan sin distinguir mayúsculas y el monto se limpia.
//
// Son datos exactos (los firmó el emisor), a diferencia de lo que lee un OCR.
// No traen subtotal, ITBIS ni descripción.

export interface DatosQrEcf {
  rncEmisor: string
  // Puede faltar (p. ej. en facturas de consumo).
  rncComprador: string | null
  encf: string
  // "YYYY-MM-DD", o null si no venía o no era una fecha real.
  fechaEmision: string | null
  montoTotal: number | null
}

const ENCF_RE = /^E\d{12}$/

function identificacion(valor: string | undefined): string | null {
  const digitos = soloDigitos(valor ?? '')
  return digitos.length === 9 || digitos.length === 11 ? digitos : null
}

// "DD-MM-AAAA" → "AAAA-MM-DD", validada como fecha real.
function fecha(valor: string | undefined): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec((valor ?? '').trim())
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  try {
    parseFechaLocal(iso)
    return iso
  } catch {
    return null
  }
}

function monto(valor: string | undefined): number | null {
  const limpio = (valor ?? '').replace(/[,\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null
  return Math.round(Number(limpio) * 100) / 100
}

// Interpreta el texto de un QR. Devuelve null si no es el QR de un e-CF:
// tiene que ser una URL de la DGII con un e-NCF y un RNC de emisor válidos.
export function leerQrEcf(texto: string): DatosQrEcf | null {
  let url: URL
  try {
    url = new URL(texto.trim())
  } catch {
    return null
  }
  if (!/(^|\.)dgii\.gov\.do$/i.test(url.hostname)) return null

  const params = new Map<string, string>()
  for (const [clave, valor] of url.searchParams) params.set(clave.toLowerCase(), valor)

  const encf = (params.get('encf') ?? '').trim().toUpperCase()
  const rncEmisor = identificacion(params.get('rncemisor'))
  if (!ENCF_RE.test(encf) || !rncEmisor) return null

  return {
    rncEmisor,
    rncComprador: identificacion(params.get('rnccomprador')),
    encf,
    fechaEmision: fecha(params.get('fechaemision')),
    montoTotal: monto(params.get('montototal')),
  }
}

// De quién es la factura respecto al cliente del contador:
// - 'compra': el cliente es el comprador.
// - 'venta': el cliente es el emisor.
// - 'ajena': el QR nombra comprador y emisor, y ninguno es el cliente.
// - 'indeterminada': el QR no trae comprador y el emisor no es el cliente
//   (típico de una factura de consumo): no se puede saber por el QR.
export type PertenenciaQr = 'compra' | 'venta' | 'ajena' | 'indeterminada'

// Los e-CF de compras (41), gastos menores (43) y pagos al exterior (47) los
// emite el propio comprador (Guía de NCF de la DGII): con el cliente como
// emisor son compras suyas.
export function pertenenciaSegunQr(qr: DatosQrEcf, rncCliente: string): PertenenciaQr {
  if (qr.rncEmisor === rncCliente) return loEmiteElComprador(qr.encf) ? 'compra' : 'venta'
  if (qr.rncComprador === rncCliente) return 'compra'
  return qr.rncComprador ? 'ajena' : 'indeterminada'
}
