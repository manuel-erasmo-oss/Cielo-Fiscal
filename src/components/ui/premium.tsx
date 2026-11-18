import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Piezas del diseño premium (2026-11-18) que comparten Facturas, Subir lote y
// Reportes. Misma paleta y tipografía de siempre; solo utilidades de Tailwind.

// Cifra destacada con ícono: indicadores de cabecera de un módulo.
export function Cifra({ etiqueta, valor, detalle, icono: Icono, tinte }: {
  etiqueta: string
  valor: string
  detalle?: string
  icono: LucideIcon
  tinte: string
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#252840] dark:bg-[#141722] dark:shadow-none sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">{etiqueta}</p>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tinte)}>
          <Icono className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-1 truncate text-xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-zinc-50 sm:text-2xl">{valor}</p>
      {detalle && <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{detalle}</p>}
    </div>
  )
}

// Selector segmentado (reemplaza a un <select> de pocas opciones).
export function Segmentos({ etiqueta, valor, opciones, onCambio }: {
  etiqueta: string
  valor: string
  opciones: { valor: string; texto: string; cuenta?: number }[]
  onCambio: (valor: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex h-10 max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#252840] dark:bg-[#141722] dark:shadow-none">
      {opciones.map(o => {
        const activo = o.valor === valor
        return (
          <button
            key={o.valor || 'todas'}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.valor)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors',
              activo
                ? 'bg-[#1B2980] text-white shadow-sm dark:bg-indigo-600'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-[#1a1d2e] dark:hover:text-zinc-100',
            )}
          >
            {o.texto}
            {o.cuenta !== undefined && (
              <span className={cn('rounded-md px-1.5 text-[11px] font-semibold tabular-nums', activo ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-[#1a1d2e] dark:text-zinc-400')}>
                {o.cuenta}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Estado de una factura: siempre ícono + texto, nunca solo el color.
const TONOS_ESTADO = {
  bien: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20',
  aviso: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20',
  serio: 'bg-orange-50 text-orange-700 ring-orange-600/15 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-400/20',
  critico: 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-400/20',
  neutro: 'bg-zinc-100 text-zinc-600 ring-zinc-500/15 dark:bg-[#1a1d2e] dark:text-zinc-400 dark:ring-zinc-400/15',
} as const

export function Estado({ tono, icono: Icono, children }: { tono: keyof typeof TONOS_ESTADO; icono?: LucideIcon; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONOS_ESTADO[tono])}>
      {Icono && <Icono className="h-3 w-3" aria-hidden="true" />}
      {children}
    </span>
  )
}

// Franja con una acción que el sistema sugiere (aprobar, verificar…).
export function AccionSugerida({ icono: Icono, texto, accion, tono = 'neutro', progreso }: {
  icono: LucideIcon
  texto: ReactNode
  accion?: ReactNode
  tono?: 'marca' | 'neutro' | 'aviso'
  // De 0 a 1: dibuja una barra de avance fina en el borde inferior.
  progreso?: number
}) {
  return (
    <div className={cn(
      'animate-content-in relative flex flex-wrap items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 sm:px-5',
      tono === 'marca' && 'border-[#1B2980]/15 bg-gradient-to-r from-[#eef0fb] to-white dark:border-indigo-500/20 dark:from-indigo-950/40 dark:to-[#141722]',
      tono === 'neutro' && 'border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#252840] dark:bg-[#141722] dark:shadow-none',
      tono === 'aviso' && 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20',
    )}>
      <span className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
        tono === 'marca' && 'bg-[#1B2980] text-white dark:bg-indigo-600',
        tono === 'neutro' && 'bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300',
        tono === 'aviso' && 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
      )}>
        <Icono className="h-4 w-4" />
      </span>
      <div className="min-w-[200px] flex-1 text-sm text-zinc-700 dark:text-zinc-300">{texto}</div>
      {accion}
      {progreso !== undefined && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-zinc-100 dark:bg-[#1a1d2e]">
          <div className="h-full bg-gradient-to-r from-[#1B2980] to-[#2f3fa8] transition-[width] duration-300 dark:from-indigo-500 dark:to-indigo-400" style={{ width: `${Math.round(progreso * 100)}%` }} />
        </div>
      )}
    </div>
  )
}

// Pasos numerados de un proceso (Subir lote): hecho, actual o por venir.
export function Pasos({ pasos }: { pasos: { titulo: string; detalle?: string; estado: 'hecho' | 'actual' | 'pendiente' }[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {pasos.map((p, i) => (
        <li
          key={p.titulo}
          aria-current={p.estado === 'actual' ? 'step' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors',
            p.estado === 'actual' && 'border-[#1B2980]/25 bg-[#eef0fb]/70 dark:border-indigo-500/30 dark:bg-indigo-950/30',
            p.estado === 'hecho' && 'border-zinc-200/80 bg-white dark:border-[#252840] dark:bg-[#141722]',
            p.estado === 'pendiente' && 'border-dashed border-zinc-200 bg-transparent dark:border-[#252840]',
          )}
        >
          <span className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            p.estado === 'hecho' && 'bg-emerald-500 text-white',
            p.estado === 'actual' && 'bg-[#1B2980] text-white dark:bg-indigo-600',
            p.estado === 'pendiente' && 'bg-zinc-100 text-zinc-400 dark:bg-[#1a1d2e] dark:text-zinc-500',
          )}>
            {p.estado === 'hecho' ? '✓' : i + 1}
          </span>
          <div className="min-w-0">
            <p className={cn('truncate text-sm font-semibold', p.estado === 'pendiente' ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-100')}>{p.titulo}</p>
            {p.detalle && <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{p.detalle}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
