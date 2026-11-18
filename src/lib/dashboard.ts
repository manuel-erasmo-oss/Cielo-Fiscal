// Cálculos del dashboard de una empresa (src/app/empresa/[id]/page.tsx).
// Lógica pura, probada en dashboard.test.ts: recibe las facturas de UNA
// empresa (ya filtradas por EmpresaProvider) y devuelve números listos para
// dibujar. Nada aquí es una declaración: son sumas de control para el
// contador, no la IT-1 ni el 606.

import { DIA_LIMITE_IR17, DIA_LIMITE_IT1, fechaLimite606607, fechaLimiteIR17, fechaLimiteIT1 } from '@/lib/dgii-fiscal'
import { clasificacionContable, esNotaDeCredito } from '@/lib/dgii-formatos'
import { montoFacturadoDe, periodoDe } from '@/lib/documentos'
import { parseFechaLocal } from '@/lib/utils'
import { requiereVerificacionHumana } from '@/lib/verificacion-dgii'
import type { DocumentoFiscal } from '@/types'

// "YYYY-MM"
export type Periodo = string

export function periodoDeAnioMes(anio: number, mes: number): Periodo {
  return `${anio}-${String(mes).padStart(2, '0')}`
}

export function anioMes(p: Periodo): { anio: number; mes: number } {
  return { anio: Number(p.slice(0, 4)), mes: Number(p.slice(5, 7)) }
}

export function sumarMeses(p: Periodo, n: number): Periodo {
  const { anio, mes } = anioMes(p)
  const total = anio * 12 + (mes - 1) + n
  return periodoDeAnioMes(Math.floor(total / 12), (total % 12) + 1)
}

// Los n períodos que terminan en `final`, del más viejo al más nuevo.
export function ultimosPeriodos(final: Periodo, n: number): Periodo[] {
  return Array.from({ length: n }, (_, i) => sumarMeses(final, i - (n - 1)))
}

// Facturas que cuentan: todas menos las descartadas. Las pendientes sí
// cuentan (el tablero dice cuántas hay), porque son trabajo del período.
function vigentes(docs: readonly DocumentoFiscal[]): DocumentoFiscal[] {
  return docs.filter(d => d.estadoRevision !== 'descartado')
}

function delPeriodo(docs: readonly DocumentoFiscal[], p: Periodo): DocumentoFiscal[] {
  return vigentes(docs).filter(d => periodoDe(d) === p)
}

// Una nota de crédito (B04/E34) resta, igual que en los totales del 606.
function signo(d: DocumentoFiscal): number {
  return esNotaDeCredito(d) ? -1 : 1
}

function montoSinImpuestos(d: DocumentoFiscal): number {
  return signo(d) * (montoFacturadoDe(d) ?? 0)
}

function itbis(d: DocumentoFiscal): number {
  return signo(d) * (d.itbisFacturado ?? 0)
}

const r2 = (n: number) => Math.round(n * 100) / 100

// Períodos con facturas, del más nuevo al más viejo, más `incluir` (el que
// se está preparando) aunque no tenga ninguna todavía.
export function periodosDisponibles(docs: readonly DocumentoFiscal[], incluir: Periodo): Periodo[] {
  const s = new Set<Periodo>([incluir])
  for (const d of vigentes(docs)) {
    const p = periodoDe(d)
    if (p) s.add(p)
  }
  return [...s].sort().reverse()
}

export interface Totales {
  cantidad: number
  monto: number
  itbis: number
}

export interface EstadoPeriodo {
  total: number
  revisadas: number
  // Pendientes sin problema con la DGII (faltan datos o solo aprobarlas).
  porRevisar: number
  // Electrónicas sin QR legible o en un estado que no es "Aceptado".
  porVerificar: number
  // Rechazadas o inexistentes en la DGII.
  rechazadas: number
  // Revisadas / total, de 0 a 100. null si no hay facturas.
  listo: number | null
}

export interface ResumenPeriodo {
  periodo: Periodo
  compras: Totales
  ventas: Totales
  // ITBIS de ventas menos ITBIS de compras: orientativo, no la IT-1 (no
  // aplica proporcionalidad, retenciones, ITBIS llevado al costo ni saldos).
  diferenciaItbis: number
  // Compras y ventas del período, para el detalle de estados.
  estado: EstadoPeriodo
}

function totales(docs: readonly DocumentoFiscal[]): Totales {
  return {
    cantidad: docs.length,
    monto: r2(docs.reduce((s, d) => s + montoSinImpuestos(d), 0)),
    itbis: r2(docs.reduce((s, d) => s + itbis(d), 0)),
  }
}

export function estadoDe(docs: readonly DocumentoFiscal[]): EstadoPeriodo {
  let revisadas = 0, porRevisar = 0, porVerificar = 0, rechazadas = 0
  for (const d of docs) {
    const e = d.verificacionDGII?.estado
    if (e === 'rechazado' || e === 'no_encontrado') rechazadas++
    else if (d.estadoRevision === 'revisado') revisadas++
    else if (requiereVerificacionHumana(d)) porVerificar++
    else porRevisar++
  }
  const total = docs.length
  return { total, revisadas, porRevisar, porVerificar, rechazadas, listo: total ? Math.round((revisadas / total) * 100) : null }
}

export function resumenPeriodo(docs: readonly DocumentoFiscal[], periodo: Periodo): ResumenPeriodo {
  const del = delPeriodo(docs, periodo)
  const compras = totales(del.filter(d => d.tipo === 'compra'))
  const ventas = totales(del.filter(d => d.tipo === 'venta'))
  return { periodo, compras, ventas, diferenciaItbis: r2(ventas.itbis - compras.itbis), estado: estadoDe(del) }
}

// Cambio porcentual contra el período anterior. null si no hay base.
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10
}

export interface PuntoMensual {
  periodo: Periodo
  compras: number
  ventas: number
}

export function serieMensual(docs: readonly DocumentoFiscal[], final: Periodo, n = 6): PuntoMensual[] {
  return ultimosPeriodos(final, n).map(p => {
    const r = resumenPeriodo(docs, p)
    return { periodo: p, compras: r.compras.monto, ventas: r.ventas.monto }
  })
}

export type ParteComposicion = 'Costo' | 'Gasto' | 'Activo' | 'Sin clasificar'

export interface Composicion {
  parte: ParteComposicion
  monto: number
  cantidad: number
}

// Compras del período por clasificación contable (NIIF para PYMES, ver
// clasificacionContable): costo, gasto, activo y las que aún no tienen tipo
// de bienes y servicios. Orden fijo (el color sigue a la parte, no al rango).
export function composicionCompras(docs: readonly DocumentoFiscal[], periodo: Periodo): Composicion[] {
  const orden: ParteComposicion[] = ['Costo', 'Gasto', 'Activo', 'Sin clasificar']
  const acc = new Map<ParteComposicion, Composicion>(orden.map(parte => [parte, { parte, monto: 0, cantidad: 0 }]))
  for (const d of delPeriodo(docs, periodo)) {
    if (d.tipo !== 'compra') continue
    const c = acc.get(clasificacionContable(d.tipoBienesServicios) ?? 'Sin clasificar')!
    c.monto += montoSinImpuestos(d)
    c.cantidad++
  }
  return orden.map(p => ({ ...acc.get(p)!, monto: r2(acc.get(p)!.monto) }))
}

export interface Proveedor {
  clave: string
  nombre: string
  rnc: string | null
  monto: number
  cantidad: number
}

// Los n proveedores con más compras en el período (por monto sin
// impuestos); el resto se junta en "Otros".
export function principalesProveedores(docs: readonly DocumentoFiscal[], periodo: Periodo, n = 5): Proveedor[] {
  const acc = new Map<string, Proveedor>()
  for (const d of delPeriodo(docs, periodo)) {
    if (d.tipo !== 'compra') continue
    const clave = d.rncCedulaContraparte || (d.nombreContraparte ?? '').trim().toUpperCase() || '—'
    const p = acc.get(clave) ?? { clave, nombre: d.nombreContraparte || d.rncCedulaContraparte || 'Sin identificar', rnc: d.rncCedulaContraparte, monto: 0, cantidad: 0 }
    if (!acc.has(clave)) acc.set(clave, p)
    else if (!p.nombre || p.nombre === p.rnc) p.nombre = d.nombreContraparte || p.nombre
    p.monto += montoSinImpuestos(d)
    p.cantidad++
  }
  const lista = [...acc.values()].map(p => ({ ...p, monto: r2(p.monto) })).sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre))
  if (lista.length <= n) return lista
  const resto = lista.slice(n)
  return [
    ...lista.slice(0, n),
    { clave: '__otros', nombre: `Otros (${resto.length})`, rnc: null, monto: r2(resto.reduce((s, p) => s + p.monto, 0)), cantidad: resto.reduce((s, p) => s + p.cantidad, 0) },
  ]
}

export interface Vencimiento {
  clave: '606' | 'IT-1' | 'IR-17'
  nombre: string
  // Período que se declara.
  periodo: Periodo
  fecha: string
  faltan: number
}

// Próximo vencimiento de cada obligación mensual: la del mes pasado vence
// en el mes en curso; si ese día ya pasó, la próxima es la del mes en curso.
// Fechas locales (lección 1 de CLAUDE.md). Ordenados por fecha.
export function proximosVencimientos(hoyISO: string): Vencimiento[] {
  const hoy = parseFechaLocal(hoyISO)
  const actual = periodoDeAnioMes(hoy.getFullYear(), hoy.getMonth() + 1)
  const anterior = sumarMeses(actual, -1)
  const obligaciones: { clave: Vencimiento['clave']; nombre: string; fecha: (anio: number, mes: number) => string }[] = [
    { clave: 'IR-17', nombre: `Retenciones IR-17 (día ${DIA_LIMITE_IR17})`, fecha: fechaLimiteIR17 },
    { clave: '606', nombre: 'Formato 606 (día 15)', fecha: fechaLimite606607 },
    { clave: 'IT-1', nombre: `ITBIS IT-1 (día ${DIA_LIMITE_IT1})`, fecha: fechaLimiteIT1 },
  ]
  return obligaciones
    .map(o => {
      const a = anioMes(anterior)
      const periodo = hoyISO <= o.fecha(a.anio, a.mes) ? anterior : actual
      const { anio, mes } = anioMes(periodo)
      const fecha = o.fecha(anio, mes)
      const faltan = Math.round((parseFechaLocal(fecha).getTime() - hoy.getTime()) / 86_400_000)
      return { clave: o.clave, nombre: o.nombre, periodo, fecha, faltan }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// Período del 606 que se está preparando: el del próximo vencimiento.
export function periodo606EnCurso(hoyISO: string): Periodo {
  return proximosVencimientos(hoyISO).find(v => v.clave === '606')!.periodo
}

// Marcas limpias para el eje: 0 y 3-4 pasos redondos hasta cubrir `max`.
export function marcasEje(max: number, pasos = 4): number[] {
  if (max <= 0) return [0]
  const bruto = max / pasos
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= bruto)!
  const n = Math.ceil(max / paso)
  return Array.from({ length: n + 1 }, (_, i) => r2(i * paso))
}

// Monto compacto para ejes y figuras: 950 · 12.5K · 1.2M.
export function montoCompacto(n: number): string {
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (a >= 10_000) return `${s}${Math.round(a / 1000)}K`
  if (a >= 1_000) return `${s}${(a / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return `${s}${Math.round(a)}`
}
