import { montoFacturadoDe, periodoDe, puedeMarcarseRevisada } from '@/lib/documentos'
import {
  TIPO_BIENES_SERVICIOS_606,
  TIPO_INGRESO_607,
  clasificacionContable,
  esFacturaDeConsumo,
  esNotaDeCredito,
  type ClasificacionContable,
} from '@/lib/dgii-formatos'
import { requiereVerificacionHumana } from '@/lib/verificacion-dgii'
import { faltaClienteEnVenta } from '@/lib/lote/borrador'
import { redondear2, soloDigitos } from '@/lib/utils'
import type { DocumentoFiscal, TipoDocumento } from '@/types'

// Lógica pura de los módulos "Ingresos" (ventas) y "Costos y gastos"
// (compras del 606): estado de cada fila, barra de dinero, filtros, orden,
// paginación, agrupación por contraparte y exportación a CSV. Pedido por el
// usuario el 2026-11-18 (reemplaza al módulo "Facturas").

// ─── Estado de una fila ──────────────────────────────────────────────────────

// Un solo estado por factura, el más grave: rechazada (o inexistente) en la
// DGII > revisada > hay que verificarla a mano en la DGII > por revisar.
export type EstadoFila = 'rechazada' | 'revisada' | 'verificar' | 'por_revisar'

export const ESTADOS_FILA: readonly EstadoFila[] = ['por_revisar', 'verificar', 'rechazada', 'revisada']

export const ETIQUETA_ESTADO_FILA: Record<EstadoFila, string> = {
  por_revisar: 'Por revisar',
  verificar: 'Verificar en la DGII',
  rechazada: 'Rechazadas',
  revisada: 'Revisadas',
}

// La misma etiqueta para una sola factura.
export const ETIQUETA_ESTADO_UNA: Record<EstadoFila, string> = {
  por_revisar: 'Por revisar',
  verificar: 'Verificar en la DGII',
  rechazada: 'Rechazada',
  revisada: 'Revisada',
}

export function esRechazadaEnDGII(d: Pick<DocumentoFiscal, 'verificacionDGII'>): boolean {
  return !!d.verificacionDGII && (d.verificacionDGII.estado === 'rechazado' || d.verificacionDGII.estado === 'no_encontrado')
}

export function estadoDeFila(d: DocumentoFiscal): EstadoFila {
  if (esRechazadaEnDGII(d)) return 'rechazada'
  if (d.estadoRevision === 'revisado') return 'revisada'
  if (requiereVerificacionHumana(d)) return 'verificar'
  return 'por_revisar'
}

// Pendiente a la que no le falta nada ni tiene datos en duda: se puede
// aprobar sin abrirla (misma regla que "Aprobar las N" desde el 2026-11-17).
export function esAprobable(d: DocumentoFiscal, rncCliente: string): boolean {
  return d.estadoRevision === 'pendiente_revision' &&
    d.camposIncompletos.length === 0 &&
    !requiereVerificacionHumana(d) &&
    !faltaClienteEnVenta(d) &&
    puedeMarcarseRevisada(d.tipo, d, rncCliente)
}

// ─── Montos ──────────────────────────────────────────────────────────────────

// Las notas de crédito (B04/E34) restan en todos los totales.
// Nombre que se muestra para el cliente de una venta sin nombre: "Consumidor
// final" SOLO si el comprobante es de consumo (B02/E32); si no, el cliente
// falta (decisión del usuario, 2026-11-19: no se llama consumidor final a
// una venta por el mero hecho de no ver nombre ni RNC).
export const CLIENTE_SIN_IDENTIFICAR = 'Cliente sin identificar'
export function nombreClienteVenta(d: Pick<DocumentoFiscal, 'nombreContraparte' | 'rncCedulaContraparte' | 'ncf'>): string | null {
  if (d.nombreContraparte) return d.nombreContraparte
  if (d.rncCedulaContraparte) return null
  return esFacturaDeConsumo(d.ncf) ? 'Consumidor final' : CLIENTE_SIN_IDENTIFICAR
}

// Cada módulo registra solo su tipo (decisión del usuario, 2026-11-19:
// "todo tiene que quedar independiente"): Ingresos solo ventas, Costos y
// gastos solo compras. Guardia en los datos, no solo en la pantalla.
export class TipoEquivocadoError extends Error {
  constructor(public readonly tipoModulo: TipoDocumento) {
    super(tipoModulo === 'venta'
      ? 'En Ingresos solo se registran facturas de venta.'
      : 'En Costos y gastos solo se registran facturas de compra.')
    this.name = 'TipoEquivocadoError'
  }
}
export function exigirTipoDeModulo(tipoModulo: TipoDocumento, docs: readonly Pick<DocumentoFiscal, 'tipo'>[]): void {
  if (docs.some(d => d.tipo !== tipoModulo)) throw new TipoEquivocadoError(tipoModulo)
}

export const signoDe = (d: Pick<DocumentoFiscal, 'ncf'>): 1 | -1 => (esNotaDeCredito(d) ? -1 : 1)

// Total de la factura: el impreso; si no se leyó, la suma del monto sin
// impuestos y los impuestos que haya. null si no hay ningún monto.
export function totalDe(d: DocumentoFiscal): number | null {
  if (d.montoTotal !== null) return d.montoTotal
  const base = montoFacturadoDe(d)
  if (base === null) return null
  return redondear2(base + (d.itbisFacturado ?? 0) + (d.impuestoSelectivoConsumo ?? 0) + (d.otrosImpuestos ?? 0) + (d.propinaLegal ?? 0))
}

export interface Totales {
  cantidad: number
  monto: number
  itbis: number
  total: number
}

export function totalesDe(docs: readonly DocumentoFiscal[]): Totales {
  let monto = 0, itbis = 0, total = 0
  for (const d of docs) {
    const s = signoDe(d)
    monto += s * (montoFacturadoDe(d) ?? 0)
    itbis += s * (d.itbisFacturado ?? 0)
    total += s * (totalDe(d) ?? 0)
  }
  return { cantidad: docs.length, monto: redondear2(monto), itbis: redondear2(itbis), total: redondear2(total) }
}

// Barra de dinero: cantidad y total de cada estado.
export function resumenPorEstado(docs: readonly DocumentoFiscal[]): Record<EstadoFila, { cantidad: number; total: number }> {
  const r = Object.fromEntries(ESTADOS_FILA.map(e => [e, { cantidad: 0, total: 0 }])) as Record<EstadoFila, { cantidad: number; total: number }>
  for (const d of docs) {
    const b = r[estadoDeFila(d)]
    b.cantidad++
    b.total = redondear2(b.total + signoDe(d) * (totalDe(d) ?? 0))
  }
  return r
}

// "2026-03-01" → "01/03/2026", sin pasar por Date (lección 1 de CLAUDE.md).
export function fechaCorta(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso
}

// ─── Contraparte ─────────────────────────────────────────────────────────────

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Clave con la que se agrupa a un proveedor o cliente: su RNC/cédula; si no
// lo tiene, su nombre; si tampoco, "consumidor final" (solo ventas con
// comprobante de consumo, B02/E32) o "sin identificar".
export const CLAVE_CONSUMIDOR_FINAL = 'consumidor-final'
export const CLAVE_SIN_IDENTIFICAR = 'sin-identificar'
export function claveContraparte(d: Pick<DocumentoFiscal, 'rncCedulaContraparte' | 'nombreContraparte'> & Partial<Pick<DocumentoFiscal, 'tipo' | 'ncf'>>): string {
  const rnc = soloDigitos(d.rncCedulaContraparte ?? '')
  if (rnc) return `rnc:${rnc}`
  const nombre = sinAcentos(d.nombreContraparte ?? '').replace(/\s+/g, ' ')
  if (nombre) return `nombre:${nombre}`
  return d.tipo === 'venta' && esFacturaDeConsumo(d.ncf ?? null) ? CLAVE_CONSUMIDOR_FINAL : CLAVE_SIN_IDENTIFICAR
}

// Nombre de un grupo de la pestaña Proveedores/Clientes que no trae nombre.
export function nombreDeGrupo(clave: string, tipo: TipoDocumento): string | null {
  if (clave === CLAVE_CONSUMIDOR_FINAL) return 'Consumidor final'
  if (clave === CLAVE_SIN_IDENTIFICAR) return tipo === 'venta' ? CLIENTE_SIN_IDENTIFICAR : 'Sin identificar'
  return null
}

export interface FilaContraparte {
  clave: string
  nombre: string | null
  rnc: string | null
  cantidad: number
  monto: number
  itbis: number
  total: number
  ultimaFecha: string | null
  porRevisar: number
}

export function agruparPorContraparte(docs: readonly DocumentoFiscal[]): FilaContraparte[] {
  const grupos = new Map<string, FilaContraparte & { fechaNombre: string }>()
  for (const d of docs) {
    const clave = claveContraparte(d)
    let g = grupos.get(clave)
    if (!g) {
      g = { clave, nombre: null, rnc: d.rncCedulaContraparte ? soloDigitos(d.rncCedulaContraparte) : null, cantidad: 0, monto: 0, itbis: 0, total: 0, ultimaFecha: null, porRevisar: 0, fechaNombre: '' }
      grupos.set(clave, g)
    }
    const s = signoDe(d)
    g.cantidad++
    g.monto = redondear2(g.monto + s * (montoFacturadoDe(d) ?? 0))
    g.itbis = redondear2(g.itbis + s * (d.itbisFacturado ?? 0))
    g.total = redondear2(g.total + s * (totalDe(d) ?? 0))
    if (d.fechaComprobante && (!g.ultimaFecha || d.fechaComprobante > g.ultimaFecha)) g.ultimaFecha = d.fechaComprobante
    if (d.estadoRevision !== 'revisado') g.porRevisar++
    // El nombre más reciente que se haya leído para esa contraparte.
    const fecha = d.fechaComprobante ?? ''
    if (d.nombreContraparte && (g.nombre === null || fecha >= g.fechaNombre)) {
      g.nombre = d.nombreContraparte
      g.fechaNombre = fecha
    }
  }
  return [...grupos.values()].map(({ fechaNombre: _, ...g }) => g)
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

export type FiltroClasificacion = ClasificacionContable | 'sin' | ''

export interface Filtros {
  busqueda: string
  estado: EstadoFila | ''
  periodo: string // "YYYY-MM" o ''
  clasificacion: FiltroClasificacion
  contraparte: string // clave de claveContraparte o ''
}

export const FILTROS_VACIOS: Filtros = { busqueda: '', estado: '', periodo: '', clasificacion: '', contraparte: '' }

// Busca en el nombre (sin acentos), el RNC/cédula (con o sin guiones) y el NCF.
export function coincideBusqueda(d: DocumentoFiscal, busqueda: string): boolean {
  const q = busqueda.trim()
  if (!q) return true
  const texto = sinAcentos(q)
  if (d.nombreContraparte && sinAcentos(d.nombreContraparte).includes(texto)) return true
  const ncf = q.replace(/\s+/g, '').toUpperCase()
  if (d.ncf && d.ncf.toUpperCase().includes(ncf)) return true
  const digitos = soloDigitos(q)
  // Solo si lo escrito es un número (con guiones o espacios), no un nombre con algún dígito.
  if (digitos.length >= 3 && /^[\d\s-]+$/.test(q) && d.rncCedulaContraparte && soloDigitos(d.rncCedulaContraparte).includes(digitos)) return true
  return false
}

export function cumpleFiltros(d: DocumentoFiscal, f: Filtros, sin?: keyof Filtros): boolean {
  if (sin !== 'estado' && f.estado && estadoDeFila(d) !== f.estado) return false
  if (sin !== 'periodo' && f.periodo && periodoDe(d) !== f.periodo) return false
  if (sin !== 'clasificacion' && f.clasificacion) {
    const c = clasificacionContable(d.tipoBienesServicios)
    if (f.clasificacion === 'sin' ? c !== null : c !== f.clasificacion) return false
  }
  if (sin !== 'contraparte' && f.contraparte && claveContraparte(d) !== f.contraparte) return false
  if (sin !== 'busqueda' && !coincideBusqueda(d, f.busqueda)) return false
  return true
}

// Facturas de un módulo con los filtros puestos. `sin` deja fuera un filtro
// (la barra de dinero cuenta todos los estados con los demás filtros).
export function filtrarComprobantes(docs: readonly DocumentoFiscal[], tipo: TipoDocumento, f: Filtros, sin?: keyof Filtros): DocumentoFiscal[] {
  return docs.filter(d => d.tipo === tipo && cumpleFiltros(d, f, sin))
}

export function hayFiltros(f: Filtros): boolean {
  return !!(f.busqueda.trim() || f.estado || f.periodo || f.clasificacion || f.contraparte)
}

// ─── Orden ───────────────────────────────────────────────────────────────────

export type Direccion = 'asc' | 'desc'
export type CampoOrden = 'fecha' | 'contraparte' | 'total'
export interface Orden<C extends string = CampoOrden> { campo: C; dir: Direccion }

export const ORDEN_INICIAL: Orden = { campo: 'fecha', dir: 'desc' }

const comparaTexto = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' })

// Sin fecha van siempre primero (son las que hay que completar); los demás
// vacíos (sin nombre, sin total) van siempre al final. Empate: la más
// reciente en registrarse primero.
export function ordenarComprobantes(docs: readonly DocumentoFiscal[], orden: Orden): DocumentoFiscal[] {
  const m = orden.dir === 'asc' ? 1 : -1
  return [...docs].sort((a, b) => {
    let r = 0
    if (orden.campo === 'fecha') {
      if (a.fechaComprobante !== b.fechaComprobante) {
        if (a.fechaComprobante === null) return -1
        if (b.fechaComprobante === null) return 1
        r = m * a.fechaComprobante.localeCompare(b.fechaComprobante)
      }
    } else if (orden.campo === 'contraparte') {
      const x = a.nombreContraparte?.trim() || null
      const y = b.nombreContraparte?.trim() || null
      if (x !== y) {
        if (x === null) return 1
        if (y === null) return -1
        r = m * comparaTexto(x, y)
      }
    } else {
      const x = totalDe(a) === null ? null : signoDe(a) * totalDe(a)!
      const y = totalDe(b) === null ? null : signoDe(b) * totalDe(b)!
      if (x !== y) {
        if (x === null) return 1
        if (y === null) return -1
        r = m * (x - y)
      }
    }
    return r !== 0 ? r : b.creadoEn.localeCompare(a.creadoEn)
  })
}

export type CampoOrdenContraparte = 'nombre' | 'cantidad' | 'monto' | 'itbis' | 'ultimaFecha' | 'porRevisar'

export function ordenarContrapartes(filas: readonly FilaContraparte[], orden: Orden<CampoOrdenContraparte>): FilaContraparte[] {
  const m = orden.dir === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    if (orden.campo === 'nombre' || orden.campo === 'ultimaFecha') {
      const x = orden.campo === 'nombre' ? a.nombre : a.ultimaFecha
      const y = orden.campo === 'nombre' ? b.nombre : b.ultimaFecha
      if (x !== y) {
        if (x === null) return 1
        if (y === null) return -1
        const r = orden.campo === 'nombre' ? comparaTexto(x, y) : x.localeCompare(y)
        if (r !== 0) return m * r
      }
    } else if (a[orden.campo] !== b[orden.campo]) {
      return m * (a[orden.campo] - b[orden.campo])
    }
    return b.total - a.total || a.clave.localeCompare(b.clave)
  })
}

// ─── Paginación ──────────────────────────────────────────────────────────────

export const POR_PAGINA = 25

export interface Pagina<T> {
  items: T[]
  pagina: number // 1..totalPaginas (se ajusta si se pide una que no existe)
  totalPaginas: number
  desde: number // 1-based; 0 si no hay nada
  hasta: number
  total: number
}

export function paginar<T>(lista: readonly T[], pagina: number, porPagina = POR_PAGINA): Pagina<T> {
  const total = lista.length
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas)
  const inicio = (p - 1) * porPagina
  const items = lista.slice(inicio, inicio + porPagina)
  return { items, pagina: p, totalPaginas, desde: total === 0 ? 0 : inicio + 1, hasta: inicio + items.length, total }
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

// CSV para abrir en Excel: UTF-8 con BOM (acentos bien), separado por comas
// (en RD el decimal es el punto), líneas CRLF. Los montos van sin separador de
// miles y con su signo (las notas de crédito, en negativo). El RNC/cédula va
// como fórmula de texto (="00112345673") para que Excel no le quite los ceros
// ni lo pase a notación científica; el NCF empieza con letra y queda texto.
export const SEPARADOR_CSV = ','

function celda(valor: string): string {
  return /[",\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}
const rncComoTexto = (v: string | null) => (v ? `="${v.replace(/"/g, '')}"` : '')
const numero = (v: number | null, s: number) => (v === null ? '' : (s * v).toFixed(2))
const nombreCatalogo = (catalogo: readonly { codigo: string; nombre: string }[], codigo: string | null) =>
  codigo ? `${codigo} - ${catalogo.find(o => o.codigo === codigo)?.nombre ?? 'Código desconocido'}` : ''

export function csvDeComprobantes(docs: readonly DocumentoFiscal[], tipo: TipoDocumento): string {
  const compra = tipo === 'compra'
  const encabezado = compra
    ? ['Fecha', 'NCF', 'NCF modificado', 'RNC o cédula del proveedor', 'Proveedor', 'Tipo de bienes y servicios', 'Clasificación', 'Monto en servicios', 'Monto en bienes', 'Monto sin impuestos', 'ITBIS', 'Total', 'Estado', 'Verificación en la DGII']
    : ['Fecha', 'NCF', 'NCF modificado', 'RNC o cédula del cliente', 'Cliente', 'Tipo de ingreso', 'Monto sin impuestos', 'ITBIS', 'Total', 'Estado', 'Verificación en la DGII']
  const filas = docs.map(d => {
    const s = signoDe(d)
    const estado = ETIQUETA_ESTADO_UNA[estadoDeFila(d)]
    const dgii = d.verificacionDGII?.texto ?? ''
    const comunes = [d.fechaComprobante ?? '', d.ncf ?? '', d.ncfModificado ?? '', rncComoTexto(d.rncCedulaContraparte)]
    return compra
      ? [...comunes, d.nombreContraparte ?? '', nombreCatalogo(TIPO_BIENES_SERVICIOS_606, d.tipoBienesServicios), clasificacionContable(d.tipoBienesServicios) ?? '',
        numero(d.montoServicios, s), numero(d.montoBienes, s), numero(montoFacturadoDe(d), s), numero(d.itbisFacturado, s), numero(totalDe(d), s), estado, dgii]
      : [...comunes, nombreClienteVenta(d) ?? '', nombreCatalogo(TIPO_INGRESO_607, d.tipoIngreso),
        numero(montoFacturadoDe(d), s), numero(d.itbisFacturado, s), numero(totalDe(d), s), estado, dgii]
  })
  // El RNC ya viene con sus comillas de fórmula: no se vuelve a escapar.
  const linea = (campos: string[]) => campos.map(c => (c.startsWith('="') ? c : celda(c))).join(SEPARADOR_CSV)
  return '﻿' + [encabezado, ...filas].map(linea).join('\r\n')
}
