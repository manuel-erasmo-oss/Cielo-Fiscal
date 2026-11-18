'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { anioMes, obligacionesDelMes, semanasDelMes, sumarMeses, type ObligacionDelMes, type Periodo } from '@/lib/dashboard'
import { cn, formatPeriodo, parseFechaLocal } from '@/lib/utils'

// Calendario fiscal del mes en el Dashboard (pedido por el usuario el
// 2026-11-18: "un calendario fiscal que resalte las obligaciones fiscales por
// días, acorde al mes"). Reemplaza la franja de "Próximos vencimientos": la
// agenda de la derecha trae lo mismo (fecha, período, días que faltan).
//
// Solo muestra las obligaciones con fuente verificada (IR-17, 606, IT-1).
// El sistema no sabe si ya se presentaron (no hay "marcar como declarado"
// todavía), así que una fecha pasada dice "Venció", nunca "Cumplida".

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const nombreMes = (p: Periodo) => mayuscula(formatPeriodo(anioMes(p).anio, anioMes(p).mes))
const textoPeriodo = (p: Periodo) => formatPeriodo(anioMes(p).anio, anioMes(p).mes)

type Urgencia = 'vencida' | 'hoy' | 'pronto' | 'futura'
function urgencia(o: ObligacionDelMes): Urgencia {
  if (o.faltan < 0) return 'vencida'
  if (o.faltan === 0) return 'hoy'
  if (o.faltan <= 3) return 'pronto'
  return 'futura'
}

// Color por urgencia (estado), siempre acompañado del texto de la obligación.
const CHIP: Record<Urgencia, string> = {
  vencida: 'bg-zinc-100 text-zinc-500 ring-zinc-300/60 dark:bg-[#1a1d2e] dark:text-zinc-400 dark:ring-zinc-600/40',
  hoy: 'bg-rose-600 text-white ring-rose-600',
  pronto: 'bg-rose-50 text-rose-700 ring-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-500/40',
  futura: 'bg-[#eef0fb] text-[#1B2980] ring-[#1B2980]/20 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-400/30',
}

function cuenta(o: ObligacionDelMes): string {
  if (o.faltan < 0) return o.faltan === -1 ? 'Venció ayer' : `Venció hace ${-o.faltan} días`
  if (o.faltan === 0) return 'Vence hoy'
  return o.faltan === 1 ? 'Falta 1 día' : `Faltan ${o.faltan} días`
}

export function CalendarioFiscal({ hoyISO }: { hoyISO: string }) {
  const mesHoy = hoyISO.slice(0, 7)
  const [mes, setMes] = useState<Periodo>(mesHoy)
  const semanas = useMemo(() => semanasDelMes(mes), [mes])
  const obligaciones = useMemo(() => obligacionesDelMes(mes, hoyISO), [mes, hoyISO])
  const porDia = useMemo(() => {
    const m = new Map<string, ObligacionDelMes[]>()
    for (const o of obligaciones) m.set(o.fecha, [...(m.get(o.fecha) ?? []), o])
    return m
  }, [obligaciones])

  return (
    <section aria-label="Calendario fiscal" className="animate-content-in overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#252840] dark:bg-[#141722] dark:shadow-none">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Mes ───────────────────────────────────────────────────── */}
        <div className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1B2980] to-[#2f3fa8] text-white">
                <CalendarDays className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Calendario fiscal</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Obligaciones que vencen en el mes</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {mes !== mesHoy && (
                <button type="button" onClick={() => setMes(mesHoy)} className="mr-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#1B2980] transition-colors hover:bg-[#eef0fb] dark:text-indigo-300 dark:hover:bg-indigo-950/40">
                  Hoy
                </button>
              )}
              <button type="button" aria-label="Mes anterior" onClick={() => setMes(m => sumarMeses(m, -1))} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-[#1a1d2e]">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p aria-live="polite" className="min-w-[9.5rem] text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">{nombreMes(mes)}</p>
              <button type="button" aria-label="Mes siguiente" onClick={() => setMes(m => sumarMeses(m, 1))} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-[#1a1d2e]">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <table className="mt-4 w-full table-fixed border-separate border-spacing-0.5 sm:border-spacing-1" aria-label={`Calendario de ${textoPeriodo(mes)}`}>
            <thead>
              <tr>
                {DIAS.map(d => (
                  <th key={d} scope="col" className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    <span className="sm:hidden">{d.charAt(0)}</span><span className="hidden sm:inline">{d}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((semana, i) => (
                <tr key={i}>
                  {semana.map((fecha, j) => {
                    if (!fecha) return <td key={j} />
                    const dia = Number(fecha.slice(8))
                    const esHoy = fecha === hoyISO
                    const finde = j >= 5
                    const delDia = porDia.get(fecha) ?? []
                    return (
                      <td
                        key={j}
                        title={delDia.map(o => `${o.nombre} · período ${textoPeriodo(o.periodo)} · ${cuenta(o)}`).join('\n') || undefined}
                        className={cn(
                          'h-14 rounded-xl p-0.5 align-top transition-colors sm:h-16 sm:p-1.5',
                          delDia.length > 0 ? 'bg-[#f7f8fd] ring-1 ring-inset ring-[#1B2980]/10 dark:bg-indigo-950/20 dark:ring-indigo-400/15' : finde ? 'bg-zinc-50/70 dark:bg-[#171a29]/60' : '',
                        )}
                      >
                        <span className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
                          esHoy ? 'bg-[#1B2980] font-semibold text-white dark:bg-indigo-500' : finde ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-300',
                        )}>
                          {dia}
                        </span>
                        <span className="mt-0.5 flex flex-col gap-0.5">
                          {delDia.map(o => (
                            <span key={o.clave} className={cn('whitespace-nowrap rounded-md px-0.5 py-0.5 text-center text-[9px] font-semibold leading-none tracking-tight ring-1 ring-inset sm:px-1.5 sm:text-[10px] sm:tracking-normal', CHIP[urgencia(o)])}>
                              {o.clave}
                            </span>
                          ))}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Agenda del mes ────────────────────────────────────────── */}
        <div className="border-t border-zinc-100 bg-zinc-50/60 p-4 dark:border-[#1d2035] dark:bg-[#171a29]/50 sm:p-6 lg:border-l lg:border-t-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Vencen en {textoPeriodo(mes)}</p>
          <ol aria-label="Obligaciones del mes" className="mt-3 space-y-2.5">
            {obligaciones.map(o => {
              const u = urgencia(o)
              const f = parseFechaLocal(o.fecha)
              return (
                <li key={o.clave} className={cn('flex items-start gap-3 rounded-xl border bg-white p-3 dark:bg-[#141722]', u === 'hoy' || u === 'pronto' ? 'border-rose-200 dark:border-rose-900/60' : 'border-zinc-200/80 dark:border-[#252840]', u === 'vencida' && 'opacity-75')}>
                  <span className={cn('flex w-11 shrink-0 flex-col items-center rounded-lg py-1 ring-1 ring-inset', CHIP[u])}>
                    <span className="text-lg font-semibold leading-none">{f.getDate()}</span>
                    <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider">{DIAS_LARGOS[f.getDay()].slice(0, 3)}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{o.nombre}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Período {textoPeriodo(o.periodo)}</p>
                    <p className={cn('mt-1 text-xs font-semibold', u === 'vencida' ? 'text-zinc-500 dark:text-zinc-400' : u === 'futura' ? 'text-[#1B2980] dark:text-indigo-300' : 'text-rose-600 dark:text-rose-400')}>
                      {cuenta(o)}
                    </p>
                    {o.finDeSemana && (
                      <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                        Cae {DIAS_LARGOS[f.getDay()]}: confirma si se corre al siguiente día laborable.
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="mt-3 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
            Fechas nominales de la DGII, sin ajustar por fines de semana ni feriados. El sistema todavía no sabe si ya se presentaron.
          </p>
        </div>
      </div>
    </section>
  )
}
