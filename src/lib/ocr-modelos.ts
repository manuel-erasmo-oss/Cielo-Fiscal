import type { DatosQrEcf } from '@/lib/qr-ecf'
import type { CampoExtraido } from '@/types'
import type { ResultadoOCR } from '@/lib/ocr-tipos'

// Modelos con los que se puede leer una factura, y lo que cuesta cada uno.
// Lógica pura, compartida por la ruta `/api/ocr` y por la herramienta
// "Comparar modelos" (Configuración).
//
// Precios de lista de Anthropic en US$ por millón de tokens, de la referencia
// de la API consultada el 2026-11-19 (tabla "Current Models", cacheada el
// 2026-11-03). El de Haiku 5.5 vale para solicitudes de hasta 100K tokens de
// entrada; una factura usa muchos menos. Son para comparar modelos, no para
// facturar: el costo exacto está en la consola de Anthropic.

export interface ModeloOCR {
  id: string
  nombre: string
  usdEntradaPorMillon: number
  usdSalidaPorMillon: number
  // Si admite el respaldo de servidor (`fallbacks: 'default'`) cuando el
  // modelo declina por política. Haiku 5.5 no lo tiene.
  conRespaldo: boolean
}

export const MODELOS_OCR: readonly ModeloOCR[] = [
  { id: 'claude-opus-5-5', nombre: 'Opus 5.5', usdEntradaPorMillon: 4, usdSalidaPorMillon: 20, conRespaldo: true },
  { id: 'claude-sonnet-5-5', nombre: 'Sonnet 5.5', usdEntradaPorMillon: 2, usdSalidaPorMillon: 10, conRespaldo: true },
  { id: 'claude-haiku-5-5', nombre: 'Haiku 5.5', usdEntradaPorMillon: 0.1, usdSalidaPorMillon: 0.5, conRespaldo: false },
]

// Lectura escalonada (decisión del usuario, 2026-11-21, tras la evaluación
// de costos): Haiku lee todas las facturas; si su lectura no pasa las
// validaciones, Sonnet la relee UNA vez; si tampoco pasa, captura manual.
// Opus quedó fuera por costo (~US$0.05 por factura calculado).
export const MODELO_OCR_POR_DEFECTO = 'claude-haiku-5-5'
export const MODELO_OCR_RELECTURA = 'claude-sonnet-5-5'

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
