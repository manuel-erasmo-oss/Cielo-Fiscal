import type { DatosQrEcf } from '@/lib/qr-ecf'
import type { CampoExtraido } from '@/types'
import type { ResultadoOCR } from '@/lib/ocr-tipos'

// Modelos con los que se puede leer una factura, y lo que cuesta cada uno.
// Compartido por el navegador y el servidor.
//
// El usuario no debe saber qué IA se usa (decisión del usuario, 2026-11-25):
// el navegador solo conoce estos nombres neutros (rol del modelo). Qué modelo
// real hay detrás lo sabe solo el servidor (`ocr-modelos-servidor.ts`).
//
// Precios de lista en US$ por millón de tokens, consultados el 2026-11-19
// (referencia de la API, tabla de modelos cacheada el 2026-11-03). Son para
// comparar, no para facturar: el costo exacto está en la consola del
// proveedor.

export type IdModeloOCR = 'principal' | 'relectura' | 'avanzado'

export interface ModeloOCR {
  id: IdModeloOCR
  nombre: string
  usdEntradaPorMillon: number
  usdSalidaPorMillon: number
}

export const MODELOS_OCR: readonly ModeloOCR[] = [
  { id: 'principal', nombre: 'Modelo principal', usdEntradaPorMillon: 0.1, usdSalidaPorMillon: 0.5 },
  { id: 'relectura', nombre: 'Modelo de relectura', usdEntradaPorMillon: 2, usdSalidaPorMillon: 10 },
  { id: 'avanzado', nombre: 'Modelo avanzado', usdEntradaPorMillon: 4, usdSalidaPorMillon: 20 },
]

// Lectura escalonada (decisión del usuario, 2026-11-21 y 2026-11-25): el
// modelo principal lee todas las facturas; si no se ven bien los montos, el
// ITBIS, el RNC o el NCF, el de relectura la lee UNA vez; si tampoco, captura
// manual. El avanzado quedó fuera por costo (~US$0.05 por factura calculado).
export const MODELO_OCR_POR_DEFECTO: IdModeloOCR = 'principal'
export const MODELO_OCR_RELECTURA: IdModeloOCR = 'relectura'

export function modeloOCR(id: string | null | undefined): ModeloOCR | null {
  return MODELOS_OCR.find(m => m.id === id) ?? null
}

export interface UsoOCR {
  // Modelo que respondió (puede ser el de respaldo si el pedido declinó).
  modelo: string
  tokensEntrada: number
  tokensSalida: number
  // Instrucciones servidas desde la caché (cobradas a 0.1×) y escritas en
  // ella (1.25×, la primera vez). No están incluidas en `tokensEntrada`.
  tokensCacheLeidos?: number
  tokensCacheEscritos?: number
}

// Costo estimado en US$ de una lectura, o null si el modelo no está en la
// lista (no se inventa un precio).
export function costoUSD(uso: UsoOCR): number | null {
  const m = modeloOCR(uso.modelo)
  if (!m) return null
  const entrada = uso.tokensEntrada + (uso.tokensCacheLeidos ?? 0) * 0.1 + (uso.tokensCacheEscritos ?? 0) * 1.25
  return (entrada * m.usdEntradaPorMillon + uso.tokensSalida * m.usdSalidaPorMillon) / 1_000_000
}

// ── Comparación de dos lecturas de la misma página ─────────────────────────

export type CampoComparado = CampoExtraido | 'tipo' | 'esComprobante'

export interface Diferencia {
  campo: CampoComparado
  a: string
  b: string
}

// Valor normalizado para comparar: sin espacios sobrantes, montos a 2
// decimales, RNC y NCF sin guiones ni espacios.
function normalizar(campo: CampoComparado, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'number') return valor.toFixed(2)
  if (typeof valor === 'boolean') return valor ? 'sí' : 'no'
  if (Array.isArray(valor)) return valor.length ? JSON.stringify(valor) : '—'
  const texto = String(valor).trim().replace(/\s+/g, ' ')
  if (campo === 'ncf' || campo === 'ncfModificado' || campo === 'rncCedulaContraparte') {
    return texto.replace(/[\s-]/g, '').toUpperCase()
  }
  return texto
}

export function compararLecturas(a: ResultadoOCR, b: ResultadoOCR): { diferencias: Diferencia[]; comparados: number } {
  const pares: [CampoComparado, unknown, unknown][] = [
    ['esComprobante', a.esComprobante, b.esComprobante],
    ['tipo', a.tipo, b.tipo],
  ]
  const campos = new Set([...Object.keys(a.extraccion), ...Object.keys(b.extraccion)]) as Set<CampoExtraido>
  for (const c of campos) pares.push([c, a.extraccion[c], b.extraccion[c]])

  const diferencias: Diferencia[] = []
  let comparados = 0
  for (const [campo, va, vb] of pares) {
    const na = normalizar(campo, va)
    const nb = normalizar(campo, vb)
    if (na === '—' && nb === '—') continue // ninguno lo leyó: no cuenta
    comparados++
    if (na !== nb) diferencias.push({ campo, a: na, b: nb })
  }
  return { diferencias, comparados }
}

// Contra el QR (que firmó el emisor), cuántos de los datos que trae acertó
// una lectura: NCF, RNC de la contraparte, fecha y total.
export interface AciertoQr {
  aciertos: number
  total: number
  fallos: CampoExtraido[]
}

export function aciertosContraQr(r: ResultadoOCR, qr: DatosQrEcf, rncCliente: string): AciertoQr {
  const cliente = rncCliente.replace(/\D/g, '')
  const contraparte = qr.rncEmisor === cliente ? qr.rncComprador : qr.rncEmisor
  const esperados: [CampoExtraido, unknown][] = [
    ['ncf', qr.encf],
    ['fechaComprobante', qr.fechaEmision],
    ['montoTotal', qr.montoTotal],
  ]
  if (contraparte) esperados.push(['rncCedulaContraparte', contraparte])

  const fallos: CampoExtraido[] = []
  let total = 0
  for (const [campo, esperado] of esperados) {
    if (esperado === null || esperado === undefined) continue
    total++
    if (normalizar(campo, r.extraccion[campo]) !== normalizar(campo, esperado)) fallos.push(campo)
  }
  return { aciertos: total - fallos.length, total, fallos }
}
