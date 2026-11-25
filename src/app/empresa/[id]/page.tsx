'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowDownLeft, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight,
  CircleAlert, Files, ShieldAlert, ShieldX, Table2,
} from 'lucide-react'
import { AgendaFiscal } from '@/components/dashboard/AgendaFiscal'
import {
  BarraEstado, BarrasLista, COLOR_ESTADO, ColumnasMes, ColumnasPares, Leyenda, DonaComposicion, LineaMes, NumeroAnimado, VARIABLES_GRAFICOS, periodoLargo,
} from '@/components/dashboard/Graficos'
import { Pagina } from '@/components/layout/Pagina'
import { rutaEmpresa, useEmpresaActiva } from '@/lib/datos/empresa-context'
import {
  composicionCompras, mesesConFacturas, montoRDCompacto, periodo606EnCurso, periodosDisponibles,
  principalesProveedores, resumenPeriodo, serieMensual, sumarMeses, variacion, type Periodo,
} from '@/lib/dashboard'
import { ETIQUETA_CAMPO, montoFacturadoDe, periodoDe } from '@/lib/documentos'
import { iniciales } from '@/lib/monograma'
import { cn, formatCedula, formatDate, formatRD, hoyLocalISO } from '@/lib/utils'
import { requiereVerificacionHumana } from '@/lib/verificacion-dgii'
import type { DocumentoFiscal } from '@/types'

// Dashboard de la empresa. Rediseñado el 2026-11-18 a pedido del usuario
// ("no me gustó ese calendario tan grande ... mira la diferencia con el de
// Cielo Nómina, se ve mucho más profesional con gráficos"): cuadrícula de
// tarjetas con etiqueta, cifra grande, subtítulo y un gráfico o lista, y una
// agenda fiscal compacta. Todo sale de las facturas de esta empresa; los
// cálculos están en src/lib/dashboard.ts. Un solo bloque de filtros arriba:
// el período (cambia todas las cifras) y el rango 3M/6M/12M (solo los
// gráficos de evolución). La empresa no se repite aquí: ya está en el menú.

const CARD = 'rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#252840] dark:bg-[#141722] dark:shadow-none'
const ETIQUETA = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400'
const RANGOS = [3, 6, 12] as const
type Rango = (typeof RANGOS)[number]

// Rutas de los módulos de compras y de ventas (las crea otra parte del
// trabajo de navegación; aquí se usan tal cual).
const rutaCostosGastos = (id: string) => `${rutaEmpresa(id)}/costos-gastos`
const rutaIngresos = (id: string) => `${rutaEmpresa(id)}/ingresos`

const facturas = (n: number) => `${n} ${n === 1 ? 'factura' : 'facturas'}`

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
  const [rango, setRango] = useState<Rango>(6)
  const [tabla, setTabla] = useState(false)

  const r = useMemo(() => resumenPeriodo(documentos, periodo), [documentos, periodo])
  const ant = useMemo(() => resumenPeriodo(documentos, sumarMeses(periodo, -1)), [documentos, periodo])
  const serie = useMemo(() => serieMensual(documentos, periodo, rango), [documentos, periodo, rango])
  const composicion = useMemo(() => composicionCompras(documentos, periodo), [documentos, periodo])
  const proveedores = useMemo(() => principalesProveedores(documentos, periodo, 5), [documentos, periodo])
  const meses = useMemo(() => mesesConFacturas(documentos), [documentos])

  const pendientes = documentos.filter(d => d.estadoRevision === 'pendiente_revision')
  const atencion = pendientes
    .map(d => ({ d, m: motivo(d) }))
    .sort((a, b) => a.m.orden - b.m.orden || b.d.creadoEn.localeCompare(a.d.creadoEn))
    .slice(0, 5)

  const idx = periodos.indexOf(periodo)
  const e = r.estado
  const todoRevisado = e.total > 0 && e.revisadas === e.total
  const dif = r.diferenciaItbis

  if (documentos.length === 0) {
    return (
      <Pagina title="Dashboard">
        <div className={cn('space-y-5', VARIABLES_GRAFICOS)}>
          <Encabezado subtitulo="Todavía no hay facturas en esta empresa" />
          <div className="animate-content-in grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AgendaFiscal hoyISO={hoyISO} className={CARD} />
            <section className={cn(CARD, 'flex flex-col items-center justify-center px-6 py-14 text-center xl:col-span-2')}>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300">
                <Files className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">El dashboard se llena con las facturas</h3>
              <p className="mt-1.5 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
                Sube las facturas de compras: una foto, un PDF o un lote completo. El sistema las lee, las verifica en la DGII y aquí verás costos, gastos, ingresos, ITBIS y lo que falta para el 606.
              </p>
              <Link href={rutaCostosGastos(empresa.id)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1B2980] to-[#2f3fa8] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(27,41,128,0.7)] transition-all hover:-translate-y-0.5">
                Subir las primeras facturas <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          </div>
        </div>
      </Pagina>
    )
  }

  return (
    <Pagina title="Dashboard">
      <div className={cn('space-y-5', VARIABLES_GRAFICOS)}>
        {/* ── Encabezado + filtros (un solo bloque, arriba de todo) ─────── */}
        <Encabezado subtitulo={`${meses} ${meses === 1 ? 'mes' : 'meses'} con facturas · montos sin impuestos, las notas de crédito restan`}>
          <div className="flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#252840] dark:bg-[#141722]">
            <button
              type="button" aria-label="Período anterior" disabled={idx >= periodos.length - 1}
              onClick={() => setElegido(periodos[idx + 1])}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-[#1a1d2e]"
            ><ChevronLeft className="h-4 w-4" /></button>
            <label className="sr-only" htmlFor="periodo-dashboard">Período</label>
            <select
              id="periodo-dashboard" value={periodo} onChange={ev => setElegido(ev.target.value)}
              className="h-7 cursor-pointer rounded-lg border-0 bg-transparent px-1.5 text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#1B2980]/30 dark:text-zinc-100 dark:[color-scheme:dark]"
            >
              {periodos.map(p => <option key={p} value={p}>{periodoLargo(p)}{p === enCurso ? ' · en curso' : ''}</option>)}
            </select>
            <button
              type="button" aria-label="Período siguiente" disabled={idx <= 0}
              onClick={() => setElegido(periodos[idx - 1])}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-[#1a1d2e]"
            ><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div role="radiogroup" aria-label="Meses en los gráficos" className="flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#252840] dark:bg-[#141722]">
            {RANGOS.map(n => (
              <button
                key={n} type="button" role="radio" aria-checked={rango === n} onClick={() => setRango(n)}
                title={`Últimos ${n} meses en los gráficos`}
                className={cn('h-7 rounded-lg px-2.5 text-xs font-semibold tabular-nums transition-colors', rango === n ? 'bg-[#1B2980] text-white dark:bg-indigo-600' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-[#1a1d2e] dark:hover:text-zinc-100')}
              >{n}M</button>
            ))}
          </div>
          <button
            type="button" onClick={() => setTabla(t => !t)} aria-pressed={tabla}
            title="Ver los gráficos de evolución como tabla"
            className={cn('inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors', tabla ? 'border-[#1B2980]/30 bg-[#eef0fb] text-[#1B2980] dark:border-indigo-400/30 dark:bg-indigo-950/50 dark:text-indigo-300' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-[#252840] dark:bg-[#141722] dark:text-zinc-300 dark:hover:bg-[#1a1d2e]')}
          >
            <Table2 className="h-3.5 w-3.5" /> Tabla
          </button>
        </Encabezado>

        <div className="animate-content-in grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* ── Fila 1 ─────────────────────────────────────────────────── */}
          <Tarjeta etiqueta="Costos y gastos" className="md:order-1 xl:order-none">
            <Cifra valor={r.compras.monto} />
            <Subtitulo cantidad={r.compras.cantidad} cambio={variacion(r.compras.monto, ant.compras.monto)} />
            <div className="mt-5">
              {tabla
                ? <TablaSerie filas={serie.map(p => ({ periodo: p.periodo, valores: [p.compras] }))} periodo={periodo} columnas={['Compras']} />
                : <ColumnasMes serie={serie.map(p => ({ periodo: p.periodo, valor: p.compras }))} seleccionado={periodo} onSeleccionar={setElegido} nombre="Compras" color="var(--c-compras)" />}
            </div>
          </Tarjeta>

          <Tarjeta etiqueta="Composición de compras" className="md:order-3 xl:order-none">
            <Cifra valor={r.compras.monto} />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Costo, gasto o activo según la NIIF para PYMES</p>
            <div className="mt-5">
              {r.compras.cantidad === 0 ? <Vacio texto="No hay compras en este período." /> : <DonaComposicion partes={composicion} />}
            </div>
          </Tarjeta>

          <Tarjeta etiqueta="Ingresos" className="md:order-2 xl:order-none">
            <Cifra valor={r.ventas.monto} />
            <Subtitulo cantidad={r.ventas.cantidad} cambio={variacion(r.ventas.monto, ant.ventas.monto)} subirEsBueno />
            <div className="mt-5">
              {tabla
                ? <TablaSerie filas={serie.map(p => ({ periodo: p.periodo, valores: [p.ventas] }))} periodo={periodo} columnas={['Ventas']} />
                : <LineaMes serie={serie.map(p => ({ periodo: p.periodo, valor: p.ventas }))} seleccionado={periodo} onSeleccionar={setElegido} nombre="Ventas" color="var(--c-ventas)" />}
            </div>
          </Tarjeta>

          {/* ── Fila 2 ─────────────────────────────────────────────────── */}
          <Tarjeta etiqueta="ITBIS del período" className="md:order-5 xl:order-none">
            <Cifra valor={Math.abs(dif)} />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {dif > 0 ? 'A pagar · orientativo' : dif < 0 ? 'A favor · orientativo' : 'Sin diferencia · orientativo'}
            </p>
            <div className="mt-5">
              <BarrasLista filas={[
                { nombre: 'ITBIS en ventas', detalle: facturas(r.ventas.cantidad), valor: r.ventas.itbis, color: 'var(--c-ventas)' },
                { nombre: 'ITBIS en compras', detalle: facturas(r.compras.cantidad), valor: r.compras.itbis, color: 'var(--c-compras)' },
              ]} />
              <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-dashed border-zinc-200 pt-3 text-sm dark:border-[#252840]">
                <span className="text-zinc-500 dark:text-zinc-400">Ventas menos compras</span>
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"><NumeroAnimado valor={dif} formato={v => formatRD(v, 0)} /></span>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Últimos {rango} meses</p>
                <Leyenda items={[{ nombre: 'En ventas', color: 'var(--c-ventas)' }, { nombre: 'En compras', color: 'var(--c-compras)' }]} />
              </div>
              {tabla
                ? <TablaSerie filas={serie.map(p => ({ periodo: p.periodo, valores: [p.itbisVentas, p.itbisCompras] }))} periodo={periodo} columnas={['En ventas', 'En compras']} />
                : <ColumnasPares
                    serie={serie.map(p => ({ periodo: p.periodo, a: p.itbisVentas, b: p.itbisCompras }))}
                    seleccionado={periodo} onSeleccionar={setElegido}
                    series={{ a: { nombre: 'ITBIS en ventas', color: 'var(--c-ventas)' }, b: { nombre: 'ITBIS en compras', color: 'var(--c-compras)' } }}
                  />}
            </div>
            <p className="mt-auto pt-4 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
              No es la IT-1: no aplica proporcionalidad, retenciones ni saldos a favor.
            </p>
          </Tarjeta>

          <AgendaFiscal hoyISO={hoyISO} className={cn(CARD, 'md:order-6 xl:order-none')} />

          <section className={cn(CARD, 'flex flex-col md:order-7 xl:order-none')}>
            <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
              <p className={ETIQUETA}>Principales proveedores</p>
              <Link href={rutaCostosGastos(empresa.id)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#1B2980] hover:underline dark:text-indigo-300">
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="mt-1 px-5 text-xs text-zinc-500 dark:text-zinc-400 sm:px-6">Por monto comprado en {periodoLargo(periodo).toLowerCase()}</p>
            {proveedores.length === 0 ? (
              <div className="p-5 sm:p-6"><Vacio texto="No hay compras en este período." /></div>
            ) : (
              <ol className="mt-3 divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-[#1d2035] dark:border-[#1d2035]">
                {proveedores.map(p => {
                  const otros = p.clave === '__otros'
                  return (
                    <li key={p.clave} className="flex items-center gap-3 px-5 py-2.5 sm:px-6" title={`${p.nombre}: ${formatRD(p.monto)} en ${facturas(p.cantidad)}`}>
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', otros ? 'bg-zinc-100 text-zinc-500 dark:bg-[#1a1d2e] dark:text-zinc-400' : 'bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/60 dark:text-indigo-300')}>
                        {otros ? '+' : iniciales(p.nombre)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-sm', otros ? 'text-zinc-500 dark:text-zinc-400' : 'font-medium text-zinc-900 dark:text-zinc-100')}>{p.nombre}</p>
                        <p className="truncate text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                          {p.rnc ? `RNC ${formatCedula(p.rnc)} · ` : ''}{facturas(p.cantidad)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(p.monto, 0)}</span>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          {/* ── Fila 3 ─────────────────────────────────────────────────── */}
          <Tarjeta etiqueta="Listo para el 606" className="md:order-4 xl:order-none">
            <p className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl"><NumeroAnimado valor={e.listo ?? 0} formato={v => String(Math.round(v))} />%</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{e.revisadas} de {facturas(e.total)} revisadas en {periodoLargo(periodo).toLowerCase()}</p>
            <div className="mt-5">
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
                href={todoRevisado ? rutaEmpresa(empresa.id, 'reportes') : rutaCostosGastos(empresa.id)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1B2980] to-[#2f3fa8] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(27,41,128,0.7)] transition-all hover:-translate-y-0.5"
              >
                {todoRevisado ? 'Preparar el 606' : e.total === 0 ? 'Ver costos y gastos' : 'Revisar las pendientes'} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Tarjeta>

          <section className={cn(CARD, 'flex flex-col overflow-hidden md:order-8 xl:order-none xl:col-span-2')}>
            <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
              <p className={ETIQUETA}>Requieren tu atención</p>
              {pendientes.length > 0 && <span className="text-xs text-zinc-500 dark:text-zinc-400">{pendientes.length} {pendientes.length === 1 ? 'pendiente' : 'pendientes'} en total</span>}
            </div>
            <p className="mt-1 px-5 text-xs text-zinc-500 dark:text-zinc-400 sm:px-6">De todos los meses, lo más grave primero</p>
            {atencion.length === 0 ? (
              <div className="m-5 flex flex-1 items-center justify-center gap-3 rounded-xl bg-zinc-50 px-6 py-8 text-sm text-zinc-500 dark:bg-[#171a29] dark:text-zinc-400 sm:m-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                Nada pendiente: todas las facturas están revisadas.
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-[#1d2035] dark:border-[#1d2035]">
                {atencion.map(({ d, m }) => {
                  const venta = d.tipo === 'venta'
                  const monto = d.montoTotal ?? montoFacturadoDe(d)
                  return (
                    <li key={d.id}>
                      <Link href={venta ? rutaIngresos(empresa.id) : rutaCostosGastos(empresa.id)} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-[#f7f8fd] dark:hover:bg-[#171a2a] xl:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:px-6">
                        <span className={cn('flex h-8 w-8 items-center justify-center rounded-full', venta ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' : 'bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/60 dark:text-indigo-300')} title={venta ? 'Venta' : 'Compra'}>
                          {venta ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{d.nombreContraparte ?? 'Sin nombre'}</p>
                          <p className="truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                            {venta ? 'Venta' : 'Compra'} · {d.ncf ?? 'Sin NCF'}{d.fechaComprobante ? ` · ${formatDate(d.fechaComprobante)}` : ''}
                          </p>
                          {/* Si la tarjeta es angosta, el motivo baja a otra línea para que el nombre no se corte. */}
                          <Motivo m={m} className="mt-1.5 xl:hidden" />
                        </div>
                        <span className="text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300">{monto !== null ? formatRD(monto, 0) : '—'}</span>
                        <Motivo m={m} className="hidden justify-self-end xl:inline-flex" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Pagina>
  )
}

function Motivo({ m, className }: { m: ReturnType<typeof motivo>; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', TONO_MOTIVO[m.tono], className)}>
      {m.tono === 'rojo' ? <ShieldX className="h-3 w-3" aria-hidden="true" /> : m.tono === 'naranja' ? <ShieldAlert className="h-3 w-3" aria-hidden="true" /> : <CircleAlert className="h-3 w-3" aria-hidden="true" />}
      {m.texto}
    </span>
  )
}

function Encabezado({ subtitulo, children }: { subtitulo: string; children?: ReactNode }) {
  return (
    <section className="animate-content-in flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Resumen fiscal</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitulo}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </section>
  )
}

function Tarjeta({ etiqueta, children, className }: { etiqueta: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn(CARD, 'flex min-w-0 flex-col p-5 sm:p-6', className)}>
      <p className={ETIQUETA}>{etiqueta}</p>
      {children}
    </section>
  )
}

// Cifra grande, compacta (RD$151K); el monto exacto queda en el título y
// para lectores de pantalla.
function Cifra({ valor }: { valor: number }) {
  return (
    <p className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl" title={formatRD(valor)}>
      <span aria-hidden="true"><NumeroAnimado valor={valor} formato={montoRDCompacto} /></span>
      <span className="sr-only">{formatRD(valor)}</span>
    </p>
  )
}

// "N facturas · ±X% vs mes anterior". Solo en ingresos subir es "bueno".
function Subtitulo({ cantidad, cambio, subirEsBueno }: { cantidad: number; cambio: number | null; subirEsBueno?: boolean }) {
  const Flecha = cambio === null || cambio === 0 ? null : cambio > 0 ? ArrowUpRight : ArrowDownRight
  const tono = !subirEsBueno || !cambio ? 'text-zinc-500 dark:text-zinc-400' : cambio > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-zinc-500 dark:text-zinc-400">
      <span>{facturas(cantidad)} ·</span>
      {cambio === null ? (
        <span>sin mes anterior para comparar</span>
      ) : (
        <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', tono)}>
          {Flecha && <Flecha className="h-3 w-3" aria-hidden="true" />}
          {cambio > 0 ? '+' : cambio < 0 ? '−' : ''}{Math.abs(cambio).toLocaleString('es-DO')}% vs mes anterior
        </span>
      )}
    </p>
  )
}

function TablaSerie({ filas, periodo, columnas }: { filas: { periodo: string; valores: number[] }[]; periodo: string; columnas: string[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          <th className="pb-1.5 font-semibold">Mes</th>
          {columnas.map(c => <th key={c} className="pb-1.5 text-right font-semibold">{c}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-[#1d2035]">
        {filas.map(f => (
          <tr key={f.periodo} className={f.periodo === periodo ? 'font-semibold' : ''}>
            <td className="py-1.5 text-zinc-600 dark:text-zinc-300">{periodoLargo(f.periodo)}</td>
            {f.valores.map((v, i) => <td key={columnas[i]} className="py-1.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(v)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
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
