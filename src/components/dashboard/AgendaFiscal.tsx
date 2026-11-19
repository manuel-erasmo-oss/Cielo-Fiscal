'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  anioMes, cuentaRegresiva, obligacionesDelMes, semanasDelMes, sumarMeses, urgenciaDe,
  type ObligacionDelMes, type Periodo, type Urgencia,
} from '@/lib/dashboard'
import { cn, formatPeriodo, parseFechaLocal } from '@/lib/utils'

// Agenda fiscal del Dashboard: un calendario compacto del mes (un punto bajo
// los días con obligación, hoy en un círculo azul) y la lista de lo que
// vence debajo. Reemplaza al calendario grande (el usuario, 2026-11-18: "no
// me gustó ese calendario tan grande en el dashboard").
//
// Solo muestra las obligaciones con fuente verificada (IR-17, 606, IT-1; ver
// obligacionesDelMes). El sistema no sabe si ya se presentaron (no hay
// "marcar como declarado" todavía), así que una fecha pasada dice "Venció",
// nunca "Cumplida". Fechas nominales, sin correr por fin de semana ni
// feriado (⚠️ SIN VERIFICAR la regla de prórroga).

const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const nombreMes = (p: Periodo) => mayuscula(formatPeriodo(anioMes(p).anio, anioMes(p).mes))
const textoPeriodo = (p: Periodo) => formatPeriodo(anioMes(p).anio, anioMes(p).mes)

// Qué se presenta en cada obligación (la etiqueta corta es la clave).
const DETALLE: Record<ObligacionDelMes['clave'], string> = {
  'IR-17': 'Retenciones',
  '606': 'Compras y gastos',
  'IT-1': 'ITBIS',
}

// Color por urgencia (estado), siempre con el texto al lado.
const PUNTO: Record<Urgencia, string> = {
  futura: 'bg-[#1B2980] dark:bg-indigo-400',
  pronto: 'bg-rose-500',
  hoy: 'bg-rose-600',
  vencida: 'bg-zinc-300 dark:bg-zinc-600',
}
const INSIGNIA: Record<Urgencia, string> = {
  futura: 'bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300',
  pronto: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  hoy: 'bg-rose-600 text-white',
  vencida: 'bg-zinc-100 text-zinc-500 dark:bg-[#1a1d2e] dark:text-zinc-400',
}

export function AgendaFiscal({ hoyISO, className }: { hoyISO: string; className?: string }) {
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
    <section aria-label="Agenda fiscal" className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between gap-2 px-5 pt-5 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Agenda fiscal</p>
        <div className="flex items-center gap-0.5">
          {mes !== mesHoy && (
            <button type="button" onClick={() => setMes(mesHoy)} className="mr-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-[#1B2980] transition-colors hover:bg-[#eef0fb] dark:text-indigo-300 dark:hover:bg-indigo-950/40">
              Hoy
            </button>
          )}
          <button type="button" aria-label="Mes anterior" onClick={() => setMes(m => sumarMeses(m, -1))} className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-[#1a1d2e] dark:hover:text-zinc-200">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p aria-live="polite" className="min-w-[7.5rem] text-center text-xs font-semibold text-zinc-900 dark:text-zinc-100">{nombreMes(mes)}</p>
          <button type="button" aria-label="Mes siguiente" onClick={() => setMes(m => sumarMeses(m, 1))} className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-[#1a1d2e] dark:hover:text-zinc-200">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 px-5 sm:px-6">
        <table className="w-full table-fixed border-collapse" aria-label={`Calendario de ${textoPeriodo(mes)}`}>
          <thead>
            <tr>
              {DIAS.map(d => (
                <th key={d} scope="col" className="pb-1.5 text-center text-[10px] font-medium text-zinc-400 dark:text-zinc-500">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semanas.map((semana, i) => (
              <tr key={i}>
                {semana.map((fecha, j) => {
                  if (!fecha) return <td key={j} className="h-8" />
                  const dia = Number(fecha.slice(8))
                  const esHoy = fecha === hoyISO
                  const delDia = porDia.get(fecha) ?? []
                  const descripcion = delDia.map(o => `${o.clave} · período ${textoPeriodo(o.periodo)} · ${cuentaRegresiva(o.faltan)}`).join('; ')
                  return (
                    <td key={j} className="h-8 p-0 text-center align-top" title={descripcion || undefined} data-fecha={fecha} data-obligaciones={delDia.map(o => o.clave).join(',') || undefined}>
                      <span
                        aria-label={descripcion ? `${dia}: ${descripcion}` : undefined}
                        className={cn(
                          'mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] tabular-nums',
                          esHoy ? 'bg-[#1B2980] font-semibold text-white dark:bg-indigo-500'
                            : delDia.length ? 'font-semibold text-zinc-900 dark:text-zinc-50'
                            : j >= 5 ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-600 dark:text-zinc-300',
                        )}
                      >
                        {dia}
                      </span>
                      <span className="mt-px flex h-1 justify-center gap-0.5" aria-hidden="true">
                        {delDia.map(o => <span key={o.clave} className={cn('h-1 w-1 rounded-full', PUNTO[urgenciaDe(o.faltan)])} />)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ol aria-label={`Vencen en ${textoPeriodo(mes)}`} className="mt-3 divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-[#1d2035] dark:border-[#1d2035]">
        {obligaciones.map(o => {
          const u = urgenciaDe(o.faltan)
          const f = parseFechaLocal(o.fecha)
          return (
            <li key={o.clave} className="flex items-start gap-3 px-5 py-2.5 sm:px-6">
              <span aria-hidden="true" className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', PUNTO[u])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {o.clave} <span className="font-normal text-zinc-500 dark:text-zinc-400">· {DETALLE[o.clave]}</span>
                  </p>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', INSIGNIA[u])}>{cuentaRegresiva(o.faltan)}</span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {f.getDate()} {MESES_CORTOS[f.getMonth()]}. · período {textoPeriodo(o.periodo)}
                </p>
                {o.finDeSemana && (
                  <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                    Cae {DIAS_LARGOS[f.getDay()]}: confirma si se corre al siguiente día laborable.
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-auto border-t border-zinc-100 px-5 py-3 text-[11px] leading-snug text-zinc-400 dark:border-[#1d2035] dark:text-zinc-500 sm:px-6">
        Fechas nominales de la DGII, sin ajustar por fines de semana ni feriados.
      </p>
    </section>
  )
}
