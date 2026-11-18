'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert,
  Files, Minus, ReceiptText, ShieldAlert, ShieldX, Table2, Upload,
} from 'lucide-react'
import { CalendarioFiscal } from '@/components/dashboard/CalendarioFiscal'
import { BarraComposicion, BarraEstado, BarrasProveedores, COLOR_ESTADO, GraficoMensual, Leyenda, VARIABLES_GRAFICOS } from '@/components/dashboard/Graficos'
import { Pagina } from '@/components/layout/Pagina'
import { rutaEmpresa, useEmpresaActiva } from '@/lib/datos/empresa-context'
import {
  composicionCompras, periodo606EnCurso, periodosDisponibles, principalesProveedores,
  resumenPeriodo, serieMensual, sumarMeses, variacion, type Periodo,
} from '@/lib/dashboard'
import { ETIQUETA_CAMPO, montoFacturadoDe, periodoDe } from '@/lib/documentos'
import { cn, formatDate, formatPeriodo, formatRD, hoyLocalISO } from '@/lib/utils'
import { requiereVerificacionHumana } from '@/lib/verificacion-dgii'
import type { DocumentoFiscal } from '@/types'

// Dashboard de la empresa (antes "Tablero"; pedido por el usuario el 2026-11-18: "en vez del
// resumen ... un dashboard profesional que se vea todo premium"). Todo sale
// de las facturas de esta empresa; los cálculos están en src/lib/dashboard.ts.
// Un solo filtro, el período, arriba de todo lo que afecta.

const CARD = 'rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#252840] dark:bg-[#141722] dark:shadow-none'
const ETIQUETA = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400'

// "Octubre de 2026": mayúscula solo al principio (la clase `capitalize`
// daría "Octubre De 2026").
const periodoLargo = (p: Periodo) => {
  const t = formatPeriodo(Number(p.slice(0, 4)), Number(p.slice(5, 7)))
  return t.charAt(0).toUpperCase() + t.slice(1)
}
// Dentro de una frase: "octubre de 2026".
const periodoTexto = (p: Periodo) => formatPeriodo(Number(p.slice(0, 4)), Number(p.slice(5, 7)))

// Por qué una factura pendiente necesita atención, de lo más grave a lo menos.
function motivo(d: DocumentoFiscal): { texto: string; tono: 'rojo' | 'naranja' | 'ambar'; orden: number } {
  const e = d.verificacionDGII?.estado
  if (e === 'rechazado') return { texto: 'Rechazada por la DGII', tono: 'rojo', orden: 0 }
  if (e === 'no_encontrado') return { texto: 'No existe en la DGII', tono: 'rojo', orden: 0 }
  if (requiereVerificacionHumana(d)) return { texto: 'Verificar en la DGII', tono: 'naranja', orden: 1 }
  const n = d.camposIncompletos.length
  if (n === 0) return { texto: 'Lista para aprobar', tono: 'ambar', orden: 3 }
  return { texto: n === 1 ? `Revisar ${ETIQUETA_CAMPO[d.camposIncompletos[0]].toLowerCase()}` : `${n} datos por revisar`, tono: 'ambar', orden: 2 }
}

const TONO_MOTIVO = {
  rojo: 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300',
  naranja: 'bg-orange-50 text-orange-700 ring-orange-600/15 dark:bg-orange-950/40 dark:text-orange-300',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300',
}

export default function DashboardEmpresaPage() {
  const { empresa, documentos } = useEmpresaActiva()
  const hoyISO = hoyLocalISO()
  const enCurso = periodo606EnCurso(hoyISO)
  const periodos = useMemo(() => periodosDisponibles(documentos, enCurso), [documentos, enCurso])
  // Por defecto, el período del 606 en curso si ya tiene facturas; si no, el
  // último que tenga.
  const [elegido, setElegido] = useState<Periodo | null>(null)
  const periodo = elegido ?? (documentos.some(d => periodoDe(d) === enCurso) ? enCurso : periodos.find(p => p !== enCurso) ?? enCurso)

  const r = useMemo(() => resumenPeriodo(documentos, periodo), [documentos, periodo])
  const ant = useMemo(() => resumenPeriodo(documentos, sumarMeses(periodo, -1)), [documentos, periodo])
  const serie = useMemo(() => serieMensual(documentos, periodo, 6), [documentos, periodo])
  const composicion = useMemo(() => composicionCompras(documentos, periodo), [documentos, periodo])
  const proveedores = useMemo(() => principalesProveedores(documentos, periodo, 5), [documentos, periodo])
  const [tabla, setTabla] = useState(false)

  const pendientes = documentos.filter(d => d.estadoRevision === 'pendiente_revision')
  const atencion = pendientes
    .map(d => ({ d, m: motivo(d) }))
    .sort((a, b) => a.m.orden - b.m.orden || b.d.creadoEn.localeCompare(a.d.creadoEn))
    .slice(0, 5)

  const idx = periodos.indexOf(periodo)
  const e = r.estado
  const todoRevisado = e.total > 0 && e.revisadas === e.total

  return (
    <Pagina title="Dashboard" subtitle="Resumen fiscal de la empresa">
      <div className={cn('space-y-5', VARIABLES_GRAFICOS)}>
        {/* ── Calendario fiscal del mes (antes, franja de próximos vencimientos) ── */}
        <CalendarioFiscal hoyISO={hoyISO} />

        {documentos.length === 0 ? (
          <section className={cn(CARD, 'animate-content-in flex flex-col items-center px-6 py-14 text-center')}>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300">
              <Files className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <h3 className="mt-4 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">El dashboard se llena con las facturas</h3>
            <p className="mt-1.5 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
              Sube el primer lote: un PDF con muchas facturas o varias fotos. El sistema las lee, las verifica en la DGII y aquí verás compras, ventas, ITBIS y lo que falta para el 606.
            </p>
            <Link href={rutaEmpresa(empresa.id, 'lote')} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1B2980] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2f3fa8] dark:bg-indigo-600 dark:hover:bg-indigo-500">
              <Upload className="h-4 w-4" /> Subir el primer lote
            </Link>
          </section>
        ) : (
          <>
            {/* ── Filtro del período (afecta todo lo de abajo) ───────────── */}
            <section className="animate-content-in flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#252840] dark:bg-[#141722]">
                <button
                  type="button" aria-label="Período anterior" disabled={idx >= periodos.length - 1}
                  onClick={() => setElegido(periodos[idx + 1])}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-[#1a1d2e]"
                ><ChevronLeft className="h-4 w-4" /></button>
                <label className="sr-only" htmlFor="periodo-dashboard">Período</label>
                <select
                  id="periodo-dashboard" value={periodo} onChange={ev => setElegido(ev.target.value)}
                  className="h-8 cursor-pointer rounded-lg border-0 bg-transparent px-2 text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#1B2980]/30 dark:text-zinc-100 dark:[color-scheme:dark]"
                >
                  {periodos.map(p => <option key={p} value={p}>{periodoLargo(p)}{p === enCurso ? ' · en curso' : ''}</option>)}
                </select>
                <button
                  type="button" aria-label="Período siguiente" disabled={idx <= 0}
                  onClick={() => setElegido(periodos[idx - 1])}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-[#1a1d2e]"
                ><ChevronRight className="h-4 w-4" /></button>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Montos sin impuestos · las notas de crédito restan · comparado con {periodoTexto(sumarMeses(periodo, -1))}
              </p>
            </section>

            {/* ── Indicadores del período ────────────────────────────────── */}
            <section className="animate-content-in grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Indicador etiqueta="Compras" valor={formatRD(r.compras.monto, 0)} detalle={`${r.compras.cantidad} ${r.compras.cantidad === 1 ? 'factura' : 'facturas'}`} cambio={variacion(r.compras.monto, ant.compras.monto)} marca="var(--c-compras)" />
              <Indicador etiqueta="Ventas" valor={formatRD(r.ventas.monto, 0)} detalle={`${r.ventas.cantidad} ${r.ventas.cantidad === 1 ? 'factura' : 'facturas'}`} cambio={variacion(r.ventas.monto, ant.ventas.monto)} subirEsBueno marca="var(--c-ventas)" />
              <Indicador etiqueta="ITBIS en compras" valor={formatRD(r.compras.itbis, 0)} detalle={`En ventas: ${formatRD(r.ventas.itbis, 0)}`} cambio={variacion(r.compras.itbis, ant.compras.itbis)} />
              <Indicador
                etiqueta="Diferencia de ITBIS"
                valor={formatRD(Math.abs(r.diferenciaItbis), 0)}
                detalle={r.diferenciaItbis > 0 ? 'A pagar · orientativo' : r.diferenciaItbis < 0 ? 'A favor · orientativo' : 'Orientativo'}
                nota="Ventas menos compras. No es la IT-1: no aplica proporcionalidad, retenciones ni saldos a favor."
              />
            </section>

            {/* ── Evolución + estado del período ─────────────────────────── */}
            <section className="animate-content-in grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className={cn(CARD, 'min-w-0 p-5 sm:p-6')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Compras y ventas</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Últimos 6 meses hasta {periodoTexto(periodo)} · toca un mes para verlo</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Leyenda items={[{ nombre: 'Compras', color: 'var(--c-compras)' }, { nombre: 'Ventas', color: 'var(--c-ventas)' }]} />
                    <button type="button" onClick={() => setTabla(t => !t)} aria-pressed={tabla} className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors', tabla ? 'bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-[#1a1d2e]')}>
                      <Table2 className="h-3.5 w-3.5" /> Tabla
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  {tabla ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          <th className="py-2 font-semibold">Mes</th><th className="py-2 text-right font-semibold">Compras</th><th className="py-2 text-right font-semibold">Ventas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-[#1d2035]">
                        {serie.map(p => (
                          <tr key={p.periodo} className={p.periodo === periodo ? 'font-semibold' : ''}>
                            <td className="py-2 text-zinc-700 dark:text-zinc-300">{periodoLargo(p.periodo)}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(p.compras)}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(p.ventas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <GraficoMensual serie={serie} seleccionado={periodo} onSeleccionar={p => setElegido(p)} />
                  )}
                </div>
              </div>

              <div className={cn(CARD, 'flex flex-col p-5 sm:p-6')}>
                <p className={ETIQUETA}>Listo para el 606</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-5xl font-semibold tracking-[-0.04em] text-zinc-900 dark:text-zinc-50">{e.listo ?? 0}%</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">{e.revisadas} de {e.total} revisadas</span>
                </div>
                <div className="mt-4">
                  <BarraEstado partes={[
                    { nombre: 'Revisadas', valor: e.revisadas, color: COLOR_ESTADO.bien },
                    { nombre: 'Por revisar', valor: e.porRevisar, color: COLOR_ESTADO.aviso },
                    { nombre: 'Verificar en la DGII', valor: e.porVerificar, color: COLOR_ESTADO.serio },
                    { nombre: 'Rechazadas o inexistentes', valor: e.rechazadas, color: COLOR_ESTADO.critico },
                  ]} />
                </div>
                <ul className="mt-4 space-y-2.5 text-sm">
                  <FilaEstado icono={CheckCircle2} color={COLOR_ESTADO.bien} nombre="Revisadas" valor={e.revisadas} />
                  <FilaEstado icono={CircleAlert} color={COLOR_ESTADO.aviso} nombre="Por revisar" valor={e.porRevisar} />
                  <FilaEstado icono={ShieldAlert} color={COLOR_ESTADO.serio} nombre="Verificar en la DGII" valor={e.porVerificar} />
                  <FilaEstado icono={ShieldX} color={COLOR_ESTADO.critico} nombre="Rechazadas o inexistentes" valor={e.rechazadas} />
                </ul>
                <div className="mt-auto pt-5">
                  <Link
                    href={rutaEmpresa(empresa.id, todoRevisado ? 'reportes' : 'facturas')}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1B2980] to-[#2f3fa8] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(27,41,128,0.7)] transition-all hover:-translate-y-0.5"
                  >
                    {todoRevisado ? 'Preparar el 606' : e.total === 0 ? 'Ver facturas' : 'Revisar las pendientes'} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </section>

            {/* ── Composición + proveedores ──────────────────────────────── */}
            <section className="animate-content-in grid gap-4 lg:grid-cols-2">
              <div className={cn(CARD, 'min-w-0 p-5 sm:p-6')}>
                <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">En qué se fueron las compras</h3>
                <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">Costo, gasto o activo según la NIIF para PYMES · {periodoLargo(periodo)}</p>
                {r.compras.cantidad === 0 ? <Vacio texto="No hay compras en este período." /> : <BarraComposicion partes={composicion} />}
              </div>
              <div className={cn(CARD, 'min-w-0 p-5 sm:p-6')}>
                <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Principales proveedores</h3>
                <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">Por monto comprado · {periodoLargo(periodo)}</p>
                {proveedores.length === 0 ? <Vacio texto="No hay compras en este período." /> : <BarrasProveedores proveedores={proveedores} />}
              </div>
            </section>

            {/* ── Requieren atención ─────────────────────────────────────── */}
            <section className={cn(CARD, 'animate-content-in overflow-hidden')}>
              <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-[#1d2035] sm:px-6">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Requieren tu atención</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">De todos los meses, lo más grave primero</p>
                </div>
                {pendientes.length > 0 && (
                  <Link href={rutaEmpresa(empresa.id, 'facturas')} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#1B2980] hover:underline dark:text-indigo-300">
                    Ver todas ({pendientes.length}) <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
              {atencion.length === 0 ? (
                <div className="flex items-center gap-3 px-6 py-6 text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  Nada pendiente: todas las facturas están revisadas.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-[#1d2035]">
                  {atencion.map(({ d, m }) => (
                    <li key={d.id}>
                      <Link href={rutaEmpresa(empresa.id, 'facturas')} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-[#f7f8fd] dark:hover:bg-[#171a2a] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:px-6">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-[#1a1d2e] dark:text-zinc-400">
                          <ReceiptText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{d.nombreContraparte ?? 'Sin nombre'}</p>
                          <p className="truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                            {d.ncf ?? 'Sin NCF'}{d.fechaComprobante ? ` · ${formatDate(d.fechaComprobante)}` : ''}{d.tipo === 'venta' ? ' · Venta' : ''}
                          </p>
                        </div>
                        <span className="hidden text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 sm:block">
                          {d.montoTotal !== null ? formatRD(d.montoTotal) : montoFacturadoDe(d) !== null ? formatRD(montoFacturadoDe(d)!) : '—'}
                        </span>
                        <span className={cn('inline-flex items-center gap-1 justify-self-end rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', TONO_MOTIVO[m.tono])}>
                          {m.tono === 'rojo' ? <ShieldX className="h-3 w-3" /> : m.tono === 'naranja' ? <ShieldAlert className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
                          {m.texto}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Pagina>
  )
}

function Indicador({ etiqueta, valor, detalle, cambio, subirEsBueno, marca, nota }: {
  etiqueta: string
  valor: string
  detalle?: string
  // Variación contra el mes anterior, en %.
  cambio?: number | null
  subirEsBueno?: boolean
  // Color de la serie en los gráficos (identidad, no texto).
  marca?: string
  nota?: string
}) {
  const sinCambio = cambio === undefined || cambio === null || cambio === 0
  const Flecha = sinCambio ? Minus : cambio! > 0 ? ArrowUpRight : ArrowDownRight
  const tonoCambio = sinCambio || !subirEsBueno
    ? 'text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-[#1a1d2e]'
    : cambio! > 0 ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40' : 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/40'
  return (
    <div className={cn(CARD, 'min-w-0 p-4 sm:p-5')} title={nota}>
      {/* En pantallas angostas la variación baja a otra línea: la etiqueta no se corta. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="flex min-w-0 items-center gap-2 whitespace-nowrap text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {marca && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: marca }} />}
          {etiqueta}
        </p>
        {cambio !== undefined && (
          <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', tonoCambio)} title="Contra el mes anterior">
            <Flecha className="h-3 w-3" />{cambio === null ? 'nuevo' : `${Math.abs(cambio).toLocaleString('es-DO')}%`}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-zinc-50 sm:text-2xl">{valor}</p>
      {detalle && <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{detalle}</p>}
      {nota && <p className="mt-2 hidden text-[11px] leading-snug text-zinc-400 dark:text-zinc-500 sm:block">{nota}</p>}
    </div>
  )
}

function FilaEstado({ icono: Icono, color, nombre, valor }: { icono: typeof CheckCircle2; color: string; nombre: string; valor: number }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
        <Icono className="h-4 w-4" style={{ color }} aria-hidden="true" />
        {nombre}
      </span>
      <span className={cn('tabular-nums', valor > 0 ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500')}>{valor}</span>
    </li>
  )
}

function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500 dark:bg-[#171a29] dark:text-zinc-400">{texto}</p>
}
