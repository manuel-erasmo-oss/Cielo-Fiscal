'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { marcasEje, montoCompacto, type Composicion, type PuntoMensual, type Proveedor } from '@/lib/dashboard'
import { cn, formatPeriodo, formatRD } from '@/lib/utils'

// Gráficos del dashboard, dibujados a mano en SVG/HTML (sin otra dependencia).
// Siguen la guía de visualización de datos: marcas finas (columnas de 24 px
// como máximo, punta redondeada de 4 px y base recta), separación de 2 px
// en el color de la superficie, rejilla de un pelo, leyenda siempre que hay
// dos series, el texto nunca del color de la serie, tooltip al pasar el
// cursor o con el teclado, y una vista de tabla de cada gráfico.
//
// Colores (validados con el script de la guía, contraste ≥ 3:1 y separación
// para daltonismo, en claro sobre #ffffff y en oscuro sobre #141722):
//   compras / gasto  #3446c4 · oscuro #6b7cf0  (índigo de la marca)
//   ventas  / costo  #0f9f8a · oscuro #1aa58c
//   activo           #c8590f · oscuro #de6e2e
// Se declaran como variables CSS en VARIABLES_GRAFICOS (en la raíz del
// dashboard) para que el modo oscuro cambie en un solo lugar.

export const VARIABLES_GRAFICOS =
  '[--c-compras:#3446c4] [--c-ventas:#0f9f8a] [--c-activo:#c8590f] [--c-neutro:#a1a1aa] [--c-sup:#ffffff] ' +
  'dark:[--c-compras:#6b7cf0] dark:[--c-ventas:#1aa58c] dark:[--c-activo:#de6e2e] dark:[--c-neutro:#52525b] dark:[--c-sup:#141722]'

// Estados (reservados: siempre con ícono y etiqueta, nunca solo el color).
export const COLOR_ESTADO = {
  bien: '#0ca30c',
  aviso: '#fab219',
  serio: '#ec835a',
  critico: '#d03b3b',
} as const

function useAncho<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)))
    ro.observe(el)
    setAncho(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, ancho]
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mesCorto = (p: string) => MESES_CORTOS[Number(p.slice(5, 7)) - 1]
const periodoLargo = (p: string) => {
  const t = formatPeriodo(Number(p.slice(0, 4)), Number(p.slice(5, 7)))
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Columna con la punta redondeada (4 px) y la base recta.
function columna(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export function Leyenda({ items }: { items: { nombre: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
      {items.map(i => (
        <li key={i.nombre} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.nombre}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({ x, y, children, ancho }: { x: number; y: number; children: ReactNode; ancho: number }) {
  // Se queda dentro del contenedor: a la izquierda del punto si no cabe.
  const izquierda = x > ancho - 190
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-[170px] rounded-xl border border-zinc-200 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur dark:border-[#2a2e48] dark:bg-[#1a1d2e]/95"
      style={{ left: izquierda ? undefined : x + 12, right: izquierda ? ancho - x + 12 : undefined, top: Math.max(0, y) }}
    >
      {children}
    </div>
  )
}

function FilaTooltip({ color, nombre, valor }: { color: string; nombre: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
        <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: color }} />
        {nombre}
      </span>
      <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{valor}</span>
    </div>
  )
}

// ─── Compras y ventas por mes (columnas agrupadas, un solo eje) ──────────

export function GraficoMensual({ serie, seleccionado, onSeleccionar }: {
  serie: PuntoMensual[]
  seleccionado: string
  onSeleccionar?: (periodo: string) => void
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [activo, setActivo] = useState<number | null>(null)
  const alto = 220
  const m = { arriba: 22, abajo: 26, izq: 44, der: 4 }
  const plotW = Math.max(0, ancho - m.izq - m.der)
  const plotH = alto - m.arriba - m.abajo
  const max = Math.max(0, ...serie.flatMap(p => [p.compras, p.ventas]))
  const marcas = marcasEje(max)
  const tope = marcas[marcas.length - 1] || 1
  const y = (v: number) => m.arriba + plotH - (Math.max(0, v) / tope) * plotH
  const banda = serie.length ? plotW / serie.length : 0
  const barra = Math.min(24, Math.max(6, (banda - 18) / 2))
  const gap = 2

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setActivo(null)}>
      {ancho > 0 && (
        <svg width={ancho} height={alto} role="img" aria-label="Compras y ventas por mes, sin impuestos" className="block overflow-visible">
          {marcas.map(t => (
            <g key={t}>
              <line x1={m.izq} x2={ancho - m.der} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-zinc-300 dark:stroke-[#33385a]' : 'stroke-zinc-100 dark:stroke-[#1f2338]'} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={m.izq - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-400 text-[10px] tabular-nums dark:fill-zinc-500">{montoCompacto(t)}</text>
            </g>
          ))}
          {serie.map((p, i) => {
            const cx = m.izq + banda * i + banda / 2
            const xC = cx - barra - gap / 2
            const xV = cx + gap / 2
            const sel = p.periodo === seleccionado
            const lift = activo === i
            return (
              <g key={p.periodo}>
                {(sel || lift) && <rect x={m.izq + banda * i + 2} y={m.arriba - 6} width={banda - 4} height={plotH + 6} rx={8} className="fill-[#1B2980]/[0.04] dark:fill-indigo-400/[0.06]" />}
                <path d={columna(xC, y(p.compras), barra, y(0) - y(p.compras))} fill="var(--c-compras)" opacity={activo !== null && !lift ? 0.55 : 1} />
                <path d={columna(xV, y(p.ventas), barra, y(0) - y(p.ventas))} fill="var(--c-ventas)" opacity={activo !== null && !lift ? 0.55 : 1} />
                {sel && (
                  <>
                    {p.compras > 0 && <text x={xC + barra / 2} y={y(p.compras) - 6} textAnchor="middle" className="fill-zinc-700 text-[10px] font-semibold tabular-nums dark:fill-zinc-200">{montoCompacto(p.compras)}</text>}
                    {p.ventas > 0 && <text x={xV + barra / 2} y={y(p.ventas) - 6} textAnchor="middle" className="fill-zinc-700 text-[10px] font-semibold tabular-nums dark:fill-zinc-200">{montoCompacto(p.ventas)}</text>}
                  </>
                )}
                <text x={cx} y={alto - 8} textAnchor="middle" className={cn('text-[11px]', sel ? 'fill-zinc-900 font-semibold dark:fill-zinc-50' : 'fill-zinc-400 dark:fill-zinc-500')}>{mesCorto(p.periodo)}</text>
                {/* Zona de toque: toda la banda del mes, mayor que las columnas. */}
                <rect
                  x={m.izq + banda * i} y={m.arriba - 10} width={banda} height={plotH + m.abajo + 10}
                  fill="transparent" tabIndex={0} role="button"
                  aria-label={`${periodoLargo(p.periodo)}: compras ${formatRD(p.compras)}, ventas ${formatRD(p.ventas)}`}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => setActivo(i)} onFocus={() => setActivo(i)} onBlur={() => setActivo(null)}
                  onClick={() => onSeleccionar?.(p.periodo)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccionar?.(p.periodo) } }}
                />
              </g>
            )
          })}
        </svg>
      )}
      {activo !== null && serie[activo] && (
        <Tooltip ancho={ancho} x={m.izq + banda * activo + banda / 2 + barra} y={m.arriba}>
          <p className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{periodoLargo(serie[activo].periodo)}</p>
          <FilaTooltip color="var(--c-compras)" nombre="Compras" valor={formatRD(serie[activo].compras)} />
          <FilaTooltip color="var(--c-ventas)" nombre="Ventas" valor={formatRD(serie[activo].ventas)} />
          {onSeleccionar && serie[activo].periodo !== seleccionado && <p className="mt-1.5 text-[11px] text-zinc-400">Clic para ver este mes</p>}
        </Tooltip>
      )}
    </div>
  )
}

// ─── Composición de las compras (barra segmentada alta) ──────────────────

const COLOR_PARTE: Record<Composicion['parte'], string> = {
  Costo: 'var(--c-ventas)',
  Gasto: 'var(--c-compras)',
  Activo: 'var(--c-activo)',
  'Sin clasificar': 'var(--c-neutro)',
}

export function BarraComposicion({ partes }: { partes: Composicion[] }) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [activa, setActiva] = useState<number | null>(null)
  const total = partes.reduce((s, p) => s + Math.max(0, p.monto), 0)
  const visibles = partes.map((p, i) => ({ ...p, i })).filter(p => p.monto > 0)
  const gap = 2
  const util = Math.max(0, ancho - gap * Math.max(0, visibles.length - 1))
  let x = 0
  const bloques = visibles.map(p => {
    const w = total ? (p.monto / total) * util : 0
    const b = { ...p, x, w, pct: total ? Math.round((p.monto / total) * 100) : 0 }
    x += w + gap
    return b
  })

  return (
    <div>
      <div ref={ref} className="relative h-7" onMouseLeave={() => setActiva(null)}>
        {total === 0 ? (
          <div className="h-7 rounded-[4px] bg-zinc-100 dark:bg-[#1a1d2e]" />
        ) : bloques.map(b => {
          const etiqueta = `${b.pct}%`
          const cabe = b.w >= etiqueta.length * 7 + 14
          return (
            <div
              key={b.parte}
              tabIndex={0}
              role="img"
              aria-label={`${b.parte}: ${formatRD(b.monto)}, ${b.pct}% de las compras`}
              onMouseEnter={() => setActiva(b.i)} onFocus={() => setActiva(b.i)} onBlur={() => setActiva(null)}
              className={cn('absolute top-0 flex h-7 items-center rounded-[4px] px-2 text-[11px] font-semibold text-white outline-none transition-[filter] focus-visible:ring-2 focus-visible:ring-[#1B2980]/40', activa === b.i && 'brightness-110')}
              // Texto dentro del bloque: blanco, salvo sobre el gris neutro.
              style={{ left: b.x, width: Math.max(2, b.w), background: COLOR_PARTE[b.parte], color: b.parte === 'Sin clasificar' ? '#18181b' : undefined }}
            >
              {cabe && <span className="tabular-nums">{etiqueta}</span>}
            </div>
          )
        })}
        {activa !== null && bloques.find(b => b.i === activa) && (() => {
          const b = bloques.find(b => b.i === activa)!
          return (
            <Tooltip ancho={ancho} x={b.x + b.w / 2} y={34}>
              <FilaTooltip color={COLOR_PARTE[b.parte]} nombre={b.parte} valor={formatRD(b.monto)} />
              <p className="mt-0.5 text-[11px] text-zinc-400">{b.pct}% · {b.cantidad} {b.cantidad === 1 ? 'factura' : 'facturas'}</p>
            </Tooltip>
          )
        })()}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {partes.filter(p => p.parte !== 'Sin clasificar' || p.cantidad > 0).map(p => (
          <li key={p.parte} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-[#171a29]">
            <span className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COLOR_PARTE[p.parte] }} />
              {p.parte}
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{p.cantidad}</span>
            </span>
            <span className="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(p.monto, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Principales proveedores (barras horizontales, una sola serie) ───────

export function BarrasProveedores({ proveedores }: { proveedores: Proveedor[] }) {
  const max = Math.max(0, ...proveedores.map(p => p.monto))
  return (
    <ol className="space-y-3.5">
      {proveedores.map((p, i) => {
        const pct = max > 0 ? Math.max(1.5, (Math.max(0, p.monto) / max) * 100) : 0
        const otros = p.clave === '__otros'
        return (
          <li key={p.clave} className="group" title={`${p.nombre}: ${formatRD(p.monto)} en ${p.cantidad} ${p.cantidad === 1 ? 'factura' : 'facturas'}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-zinc-400 dark:text-zinc-500">{otros ? '' : i + 1}</span>
                <span className={cn('truncate', otros ? 'text-zinc-500 dark:text-zinc-400' : 'font-medium text-zinc-800 dark:text-zinc-200')}>{p.nombre}</span>
              </span>
              <span className="shrink-0 tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(p.monto, 0)}</span>
            </div>
            <div className="ml-6 mt-1.5 h-2 rounded-full bg-zinc-100 dark:bg-[#1a1d2e]">
              <div
                className="h-2 rounded-full transition-[filter] group-hover:brightness-110"
                style={{ width: `${pct}%`, background: otros ? 'var(--c-neutro)' : 'var(--c-compras)' }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ─── Estado del período (barra segmentada fina, colores de estado) ───────

export function BarraEstado({ partes }: { partes: { nombre: string; valor: number; color: string }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0)
  if (total === 0) return <div className="h-2 rounded-full bg-zinc-100 dark:bg-[#1a1d2e]" />
  return (
    <div className="flex h-2 gap-[2px]" role="img" aria-label={partes.map(p => `${p.nombre}: ${p.valor}`).join(', ')}>
      {partes.filter(p => p.valor > 0).map(p => (
        <div key={p.nombre} className="h-2 rounded-full" style={{ flexGrow: p.valor, background: p.color }} />
      ))}
    </div>
  )
}
