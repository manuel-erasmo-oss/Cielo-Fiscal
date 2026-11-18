'use client'

import Link from 'next/link'
import { ArrowRight, CalendarClock, CheckCircle2, CircleAlert, FileSpreadsheet, Files, PenLine, ReceiptText, ShieldAlert, ShieldX } from 'lucide-react'
import { Pagina } from '@/components/layout/Pagina'
import { Monograma } from '@/components/ui/Monograma'
import { fechaLimite606607 } from '@/lib/dgii-fiscal'
import { rutaEmpresa, useEmpresaActiva } from '@/lib/datos/empresa-context'
import { ETIQUETA_CAMPO, montoFacturadoDe } from '@/lib/documentos'
import { cn, formatCedula, formatDate, formatPeriodo, formatRD, hoyLocalISO, parseFechaLocal } from '@/lib/utils'
import { requiereVerificacionHumana } from '@/lib/verificacion-dgii'
import type { DocumentoFiscal } from '@/types'

// Resumen de la empresa en la que se entró: solo sus números. Diseño premium
// del 2026-11-18 con la paleta y la tipografía de la marca.

const DIA_MS = 86_400_000

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

export default function ResumenEmpresaPage() {
  const { empresa, documentos } = useEmpresaActiva()

  const pendientes = documentos.filter(d => d.estadoRevision === 'pendiente_revision')
  const porVerificar = pendientes.filter(d => requiereVerificacionHumana(d)).length
  const revisadas = documentos.filter(d => d.estadoRevision === 'revisado').length
  const atencion = pendientes
    .map(d => ({ d, m: motivo(d) }))
    .sort((a, b) => a.m.orden - b.m.orden || b.d.creadoEn.localeCompare(a.d.creadoEn))
    .slice(0, 6)

  // Próximo vencimiento del 606: el del mes pasado vence el día 15 de este
  // mes; si ese día ya pasó, el próximo es el de este mes (vence el 15 del
  // mes que viene). Fechas siempre locales (lección 1 de CLAUDE.md).
  const hoyISO = hoyLocalISO()
  const hoy = parseFechaLocal(hoyISO)
  const anterior = hoy.getMonth() === 0 ? { anio: hoy.getFullYear() - 1, mes: 12 } : { anio: hoy.getFullYear(), mes: hoy.getMonth() }
  const actual = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 }
  const mesAnterior = hoyISO <= fechaLimite606607(anterior.anio, anterior.mes) ? anterior : actual
  const vence606 = fechaLimite606607(mesAnterior.anio, mesAnterior.mes)
  const faltan = Math.round((parseFechaLocal(vence606).getTime() - hoy.getTime()) / DIA_MS)
  // Avance del ciclo (≈ un mes entre vencimientos) para la barra.
  const avance = Math.min(100, Math.max(4, ((31 - Math.min(faltan, 31)) / 31) * 100))

  return (
    <Pagina title="Resumen" subtitle={empresa.nombreComercial ?? empresa.razonSocial}>
      {/* ── Identidad + vencimiento ──────────────────────────────────── */}
      <section className="animate-content-in grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#252840] dark:bg-[#141722] dark:shadow-none">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#1B2980] via-[#2f3fa8] to-[#00E676]" />
          <div className="flex items-start gap-4">
            <Monograma nombre={empresa.razonSocial} clave={empresa.id} tamano="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">Ficha de la empresa</p>
              <h2 className="mt-1 truncate text-xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-zinc-50">{empresa.razonSocial}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-zinc-100 px-2 py-1 font-medium tabular-nums text-zinc-700 dark:bg-[#1a1d2e] dark:text-zinc-300">
                  {empresa.tipoPersona === 'juridica' ? 'RNC' : 'Cédula'} {formatCedula(empresa.rncCedula)}
                </span>
                <span className="rounded-md bg-[#eef0fb] px-2 py-1 font-medium text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300">
                  {empresa.tipoPersona === 'juridica' ? 'Persona jurídica' : 'Persona física'}
                </span>
              </div>
              {empresa.actividad && (
                <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  <span className="text-zinc-400 dark:text-zinc-500">Actividad · </span>{empresa.actividad}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-[#252840] dark:bg-[#141722] dark:shadow-none">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
            <CalendarClock className="h-3.5 w-3.5" /> Próximo vencimiento
          </div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Formato 606 de <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatPeriodo(mesAnterior.anio, mesAnterior.mes)}</span>
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={cn('text-4xl font-semibold tabular-nums tracking-[-0.03em]', faltan <= 3 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-50')}>
              {faltan}
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">{faltan === 1 ? 'día' : 'días'} · vence el {formatDate(vence606)}</span>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-[#1a1d2e]">
            <div className={cn('h-full rounded-full', faltan <= 3 ? 'bg-rose-500' : 'bg-gradient-to-r from-[#1B2980] to-[#2f3fa8] dark:from-indigo-500 dark:to-indigo-400')} style={{ width: `${avance}%` }} />
          </div>
          <Link href={rutaEmpresa(empresa.id, 'reportes')} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#1B2980] hover:underline dark:text-indigo-300">
            Preparar el 606 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* ── Indicadores ──────────────────────────────────────────────── */}
      <section className="animate-content-in grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Facturas registradas" valor={documentos.length} icono={ReceiptText} acento="bg-[#1B2980]" tinte="bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300" />
        <Kpi etiqueta="Por revisar" valor={pendientes.length} icono={CircleAlert} acento="bg-amber-500" tinte="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" nota="No entran a reportes hasta revisarlas" />
        <Kpi etiqueta="Por verificar en la DGII" valor={porVerificar} icono={ShieldAlert} acento="bg-orange-500" tinte="bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300" nota="Electrónicas sin QR legible" />
        <Kpi etiqueta="Revisadas" valor={revisadas} icono={CheckCircle2} acento="bg-emerald-500" tinte="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" />
      </section>

      {/* ── Accesos directos ─────────────────────────────────────────── */}
      <section className="animate-content-in grid gap-3 md:grid-cols-3">
        <Acceso href={rutaEmpresa(empresa.id, 'lote')} icono={Files} titulo="Subir lote de facturas" texto="Un PDF con muchas facturas o varias fotos: el sistema lee y llena todo." destacado />
        <Acceso href={rutaEmpresa(empresa.id, 'facturas')} icono={PenLine} titulo="Revisar facturas" texto={pendientes.length > 0 ? `${pendientes.length} esperan tu revisión.` : 'Todas al día. Registra o corrige facturas.'} />
        <Acceso href={rutaEmpresa(empresa.id, 'reportes')} icono={FileSpreadsheet} titulo="Generar reportes" texto="606 para la DGII y reporte de ingresos, en TXT y Excel." />
      </section>

      {/* ── Requieren atención ───────────────────────────────────────── */}
      <section className="animate-content-in overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-[#252840] dark:bg-[#141722] dark:shadow-none">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 dark:border-[#1d2035]">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Requieren tu atención</h3>
          {pendientes.length > 0 && (
            <Link href={rutaEmpresa(empresa.id, 'facturas')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B2980] hover:underline dark:text-indigo-300">
              Ver todas ({pendientes.length}) <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        {atencion.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            {documentos.length === 0 ? 'Todavía no hay facturas. Sube el primer lote para empezar.' : 'Nada pendiente: todas las facturas están revisadas.'}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-[#1d2035]">
            {atencion.map(({ d, m }) => (
              <li key={d.id}>
                <Link href={rutaEmpresa(empresa.id, 'facturas')} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-[#f7f8fd] dark:hover:bg-[#171a2a] sm:grid-cols-[minmax(0,1fr)_auto_auto]">
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
                    {m.tono === 'rojo' && <ShieldX className="h-3 w-3" />}{m.texto}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Pagina>
  )
}

function Kpi({ etiqueta, valor, icono: Icono, acento, tinte, nota }: {
  etiqueta: string; valor: number; icono: typeof ReceiptText; acento: string; tinte: string; nota?: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-[#252840] dark:bg-[#141722] dark:shadow-none">
      <span aria-hidden="true" className={cn('absolute left-0 top-5 h-8 w-[3px] rounded-r-full', acento)} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase leading-snug tracking-[0.12em] text-zinc-500 dark:text-zinc-400">{etiqueta}</p>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tinte)}>
          <Icono className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-[-0.03em] text-zinc-900 dark:text-zinc-50">{valor}</p>
      {nota && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{nota}</p>}
    </div>
  )
}

function Acceso({ href, icono: Icono, titulo, texto, destacado }: {
  href: string; icono: typeof Files; titulo: string; texto: string; destacado?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex flex-col rounded-2xl border p-5 transition-all hover:-translate-y-0.5',
        destacado
          ? 'border-transparent bg-gradient-to-br from-[#1B2980] to-[#2f3fa8] text-white shadow-[0_14px_30px_-14px_rgba(27,41,128,0.6)] hover:shadow-[0_18px_36px_-14px_rgba(27,41,128,0.7)]'
          : 'border-zinc-200 bg-white shadow-sm hover:border-[#1B2980]/30 hover:shadow-md dark:border-[#252840] dark:bg-[#141722] dark:hover:border-indigo-500/40',
      )}
    >
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', destacado ? 'bg-white/15' : 'bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300')}>
        <Icono className="h-5 w-5" />
      </span>
      <p className={cn('mt-4 text-[15px] font-semibold tracking-tight', destacado ? 'text-white' : 'text-zinc-900 dark:text-zinc-100')}>{titulo}</p>
      <p className={cn('mt-1 text-sm leading-relaxed', destacado ? 'text-indigo-100/85' : 'text-zinc-500 dark:text-zinc-400')}>{texto}</p>
      <ArrowRight className={cn('absolute right-5 top-5 h-4 w-4 transition-transform group-hover:translate-x-0.5', destacado ? 'text-white/70' : 'text-zinc-300 dark:text-zinc-600')} />
    </Link>
  )
}
