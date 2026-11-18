import { esECF, type Problema } from '@/lib/dgii-formatos'
import { redondear2 } from '@/lib/utils'
import type { EstadoDGII, VerificacionDGII } from '@/types'

// Verificación de un comprobante electrónico en la DGII, lógica pura.
//
// Por qué: el Decreto 254-06 (art. 27) obliga a quien usa un comprobante para
// crédito de ITBIS o para costos y gastos a consultar su validez en la DGII,
// y según la NG 01-2020 un e-CF rechazado no vale para fines fiscales (art. 8
// párr. V). El usuario pidió (2026-11-18) que el sistema lo verifique solo,
// para que ninguna factura rechazada llegue a un reporte.
//
// Cómo: el código QR de un e-CF es la dirección de la consulta de la DGII
// (NG 01-2020, art. 3 j: el timbre permite verificar que el e-NCF está
// autorizado y que sus datos no se alteraron). Medido el 2026-11-18 contra
// la consulta real:
// - Con todos los parámetros del QR responde una tabla con RNC y razón social
//   de emisor y comprador, e-NCF, fecha de emisión, total de ITBIS, monto
//   total y "Estado" (las tres facturas reales probadas: "Aceptado").
// - Si falta el código de seguridad o la fecha de firma, o el monto no es el
//   del QR, responde "No fue encontrada la factura (e-CF)". Sin el QR no se
//   puede consultar, y un QR alterado no pasa.
// - Los nombres de los demás estados ("Rechazado", "Aceptado Condicional",
//   "En Proceso") salen de las definiciones de la NG 01-2020, art. 3 b); no
//   se han visto en una respuesta real.

// Solo estas direcciones se consultan: el servidor no debe pedir cualquier
// URL que le manden (sería un proxy abierto).
const HOSTS_CONSULTA = new Set(['ecf.dgii.gov.do', 'fc.dgii.gov.do'])
const RUTA_CONSULTA = /^\/ecf\/consultatimbre(?:fc)?\/?$/i

export function esUrlConsultaDGII(texto: string): boolean {
  let url: URL
  try {
    url = new URL(texto)
  } catch {
    return false
  }
  return url.protocol === 'https:' && HOSTS_CONSULTA.has(url.hostname.toLowerCase()) &&
    url.port === '' && url.username === '' && url.password === '' && RUTA_CONSULTA.test(url.pathname)
}

export interface DatosConsultaDGII {
  rncEmisor: string | null
  razonSocialEmisor: string | null
  rncComprador: string | null
  razonSocialComprador: string | null
  encf: string | null
  totalItbis: number | null
  montoTotal: number | null
}

export interface RespuestaDGII {
  estado: EstadoDGII
  texto: string
  datos: DatosConsultaDGII | null
}

export class RespuestaDGIIDesconocida extends Error {}

function decodificar(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function monto(texto: string | undefined): number | null {
  if (!texto) return null
  const n = Number(texto.replace(/,/g, ''))
  return Number.isFinite(n) ? redondear2(n) : null
}

export function normalizarEstado(texto: string): EstadoDGII {
  const t = sinAcentos(texto).replace(/\s+/g, ' ').trim()
  if (t === 'aceptado') return 'aceptado'
  if (t === 'aceptado condicional') return 'aceptado_condicional'
  if (t === 'rechazado') return 'rechazado'
  if (t === 'en proceso') return 'en_proceso'
  return 'otro'
}

// De la página que devuelve la DGII al estado del comprobante. Si la página
// no tiene ninguna de las dos formas conocidas, lanza: es mejor decir "no se
// pudo verificar" que inventar un estado.
export function interpretarRespuestaDGII(pagina: string): RespuestaDGII {
  // La página trae scripts de la DGII; solo cuenta el contenido visible.
  const html = pagina.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  if (/No fue encontrada la factura/i.test(html)) {
    return { estado: 'no_encontrado', texto: 'No fue encontrada la factura (e-CF).', datos: null }
  }
  const filas = new Map<string, string>()
  for (const m of html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    filas.set(sinAcentos(decodificar(m[1])), decodificar(m[2]))
  }
  const texto = filas.get('estado')
  if (!texto) throw new RespuestaDGIIDesconocida('La DGII respondió algo que no se reconoce.')
  const digitos = (v: string | undefined) => v?.replace(/\D/g, '') || null
  return {
    estado: normalizarEstado(texto),
    texto,
    datos: {
      rncEmisor: digitos(filas.get('rnc emisor')),
      razonSocialEmisor: filas.get('razon social emisor') || null,
      rncComprador: digitos(filas.get('rnc comprador')),
      razonSocialComprador: filas.get('razon social comprador') || null,
      encf: filas.get('e-ncf')?.toUpperCase() || null,
      totalItbis: monto(filas.get('total de itbis')),
      montoTotal: monto(filas.get('monto total')),
    },
  }
}

// e-NCF que trae la dirección del QR (el nombre del parámetro varía en
// mayúsculas: ENCF, encf…).
export function encfDeQr(url: string): string | null {
  try {
    for (const [k, v] of new URL(url).searchParams) if (k.toLowerCase() === 'encf') return v.trim().toUpperCase() || null
  } catch {
    // URL inválida: sin e-NCF
  }
  return null
}

// Qué significa el estado para la factura. Rechazado y no encontrado son
// errores: no se puede marcar como revisada ni entrar a un reporte.
//
// Factura electrónica que no se pudo verificar (QR borroso o ilegible, o la
// consulta falló) o que la DGII tiene en proceso: decisión del usuario
// (2026-11-18), igual que un dato borroso: queda con observación para que
// una persona la verifique en la DGII, y por eso no se aprueba en bloque
// (ver `requiereVerificacionHumana`). No es un error: una persona puede
// marcarla revisada después de verificarla.
//
// Serie B: no trae código QR, así que no hay nada que verificar desde el
// sistema; pasa sin alerta (el usuario pidió dejar pasar la serie B).
export function problemaVerificacion(doc: { ncf: string | null; qrUrl?: string; verificacionDGII?: VerificacionDGII }): Problema | null {
  // La verificación es la del comprobante del QR: si el NCF de la factura es
  // otro (se corrigió a mano o la lectura se equivocó), no la cubre.
  const delQr = doc.qrUrl ? encfDeQr(doc.qrUrl) : null
  if (delQr && doc.ncf && doc.ncf.replace(/\s+/g, '').toUpperCase() !== delQr) {
    return { campo: 'ncf', nivel: 'error', mensaje: `El NCF no coincide con el del código QR de la factura (${delQr}).` }
  }
  const v = doc.verificacionDGII
  if (!v) {
    if (!esECF(doc.ncf)) return null
    return {
      campo: 'ncf', nivel: 'aviso',
      mensaje: 'Sin verificar en la DGII: no se pudo leer el código QR de esta factura electrónica. Verifícala a mano en la consulta de la DGII antes de aprobarla.',
    }
  }
  switch (v.estado) {
    case 'aceptado':
    case 'aceptado_condicional':
      return null
    case 'rechazado':
      return { campo: 'ncf', nivel: 'error', mensaje: 'La DGII rechazó este comprobante: no vale para costos, gastos ni crédito de ITBIS.' }
    case 'no_encontrado':
      return { campo: 'ncf', nivel: 'error', mensaje: 'La DGII no encuentra este comprobante con los datos de su código QR. Puede no haberse enviado a la DGII o estar alterado.' }
    case 'en_proceso':
      return { campo: 'ncf', nivel: 'aviso', mensaje: 'La DGII todavía está validando este comprobante. Vuelve a verificarlo más tarde o verifícalo a mano antes de aprobarlo.' }
    default:
      return { campo: 'ncf', nivel: 'aviso', mensaje: `La DGII respondió un estado que el sistema no conoce: "${v.texto}". Revísalo.` }
  }
}

// e-CF que una persona tiene que verificar en la DGII antes de aprobarlo: sin
// verificación, en proceso o con un estado desconocido. Cuenta como
// observación (campo NCF) y la factura no entra en la aprobación en bloque.
export function requiereVerificacionHumana(doc: { ncf: string | null; verificacionDGII?: VerificacionDGII }): boolean {
  if (!esECF(doc.ncf)) return false
  const e = doc.verificacionDGII?.estado
  return e === undefined || e === 'en_proceso' || e === 'otro'
}

export const ETIQUETA_ESTADO_DGII: Record<EstadoDGII, string> = {
  aceptado: 'Aceptada en la DGII',
  aceptado_condicional: 'Aceptada (condicional)',
  rechazado: 'Rechazada por la DGII',
  en_proceso: 'En proceso en la DGII',
  no_encontrado: 'No existe en la DGII',
  otro: 'Estado desconocido',
}
