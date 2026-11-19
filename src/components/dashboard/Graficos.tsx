'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { arcosDona, marcasEje, montoCompacto, montoRDCompacto, type Composicion } from '@/lib/dashboard'
import { cn, formatPeriodo, formatRD } from '@/lib/utils'

// Gráficos del dashboard, dibujados a mano en SVG/HTML (sin otra dependencia).
// Siguen la guía de visualización de datos: un solo eje, marcas finas
// (columnas de 24 px como máximo, punta redondeada de 4 px y base recta;
// línea de 2 px con área al 10 %), separación de 2 px en el color de la
// superficie, rejilla de un pelo, el texto nunca del color de la serie,
// tooltip al pasar el cursor o con el teclado, y cada valor alcanzable sin
// tooltip (leyenda con montos o vista de tabla en la página).
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

export const COLOR_PARTE: Record<Composicion['parte'], string> = {
  Costo: 'var(--c-ventas)',
  Gasto: 'var(--c-compras)',
  Activo: 'var(--c-activo)',
  'Sin clasificar': 'var(--c-neutro)',
}

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
export const mesCorto = (p: string) => MESES_CORTOS[Number(p.slice(5, 7)) - 1]
export const periodoLargo = (p: string) => {
  const t = formatPeriodo(Number(p.slice(0, 4)), Number(p.slice(5, 7)))
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Columna con la punta redondeada (4 px) y la base recta.
function columna(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function Tooltip({ x, y, children, ancho }: { x: number; y: number; children: ReactNode; ancho: number }) {
  // Se queda dentro del contenedor: a la izquierda del punto si no cabe.
  const izquierda = x > ancho - 170
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-[150px] rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-[#2a2e48] dark:bg-[#1a1d2e]/95"
      style={{ left: izquierda ? undefined : x + 10, right: izquierda ? ancho - x + 10 : undefined, top: Math.max(0, y) }}
    >
      {children}
    </div>
  )
}

// Valor primero (fuerte), nombre después; la serie se identifica con un
// trazo corto de su color, no con el color del texto.
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

export interface PuntoSerie {
  periodo: string
  valor: number
}

// Medidas comunes de los gráficos de evolución (columnas y línea), para que
// las dos tarjetas de la fila se vean iguales.
const ALTO = 156
const M = { arriba: 20, abajo: 22, izq: 38, der: 6 }

function Rejilla({ marcas, y, ancho }: { marcas: number[]; y: (v: number) => number; ancho: number }) {
  return (
    <>
      {marcas.map(t => (
        <g key={t}>
          <line x1={M.izq} x2={ancho - M.der} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-zinc-200 dark:stroke-[#2c3150]' : 'stroke-zinc-100 dark:stroke-[#1d2136]'} strokeWidth={1} shapeRendering="crispEdges" />
          <text x={M.izq - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-400 text-[10px] tabular-nums dark:fill-zinc-500">{montoCompacto(t)}</text>
        </g>
      ))}
    </>
  )
}

// Si las bandas son angostas (12 meses en una tarjeta de móvil), solo se
// rotula un mes de cada dos, más el elegido.
function rotular(i: number, n: number, banda: number, elegido: boolean): boolean {
  if (elegido || banda >= 24) return true
  return (n - 1 - i) % 2 === 0
}

// ─── Columnas finas de una sola serie (compras por mes) ──────────────────

export function ColumnasMes({ serie, seleccionado, onSeleccionar, nombre, color }: {
  serie: PuntoSerie[]
  seleccionado: string
  onSeleccionar?: (periodo: string) => void
  nombre: string
  color: string
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [activo, setActivo] = useState<number | null>(null)
  const plotW = Math.max(0, ancho - M.izq - M.der)
  const plotH = ALTO - M.arriba - M.abajo
  const marcas = marcasEje(Math.max(0, ...serie.map(p => p.valor)), 2)
  const tope = marcas[marcas.length - 1] || 1
  const y = (v: number) => M.arriba + plotH - (Math.max(0, v) / tope) * plotH
  const banda = serie.length ? plotW / serie.length : 0
  const barra = Math.min(24, Math.max(4, banda * 0.5))

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setActivo(null)}>
      {ancho > 0 && (
        <svg width={ancho} height={ALTO} role="group" aria-label={`${nombre} por mes, sin impuestos`} className="block overflow-visible">
          <Rejilla marcas={marcas} y={y} ancho={ancho} />
          {serie.map((p, i) => {
            const cx = M.izq + banda * i + banda / 2
            const sel = p.periodo === seleccionado
            const resalta = sel || activo === i
            return (
              <g key={p.periodo}>
                <path d={columna(cx - barra / 2, y(p.valor), barra, y(0) - y(p.valor))} fill={color} fillOpacity={resalta ? 1 : 0.32} />
                {sel && p.valor > 0 && (
                  <text x={cx} y={y(p.valor) - 6} textAnchor="middle" className="fill-zinc-700 text-[10px] font-semibold tabular-nums dark:fill-zinc-200">{montoCompacto(p.valor)}</text>
                )}
                {rotular(i, serie.length, banda, sel) && (
                  <text x={cx} y={ALTO - 6} textAnchor="middle" className={cn('text-[10px]', sel ? 'fill-zinc-900 font-semibold dark:fill-zinc-50' : 'fill-zinc-400 dark:fill-zinc-500')}>{mesCorto(p.periodo)}</text>
                )}
                {/* Zona de toque: toda la banda del mes, mayor que la columna. */}
                <rect
                  x={M.izq + banda * i} y={M.arriba - 12} width={banda} height={plotH + M.abajo + 12}
                  fill="transparent" tabIndex={0} role="button"
                  aria-label={`${periodoLargo(p.periodo)}: ${nombre.toLowerCase()} ${formatRD(p.valor)}`}
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
        <Tooltip ancho={ancho} x={M.izq + banda * activo + banda / 2 + barra / 2} y={M.arriba}>
          <p className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{periodoLargo(serie[activo].periodo)}</p>
          <FilaTooltip color={color} nombre={nombre} valor={formatRD(serie[activo].valor)} />
          {onSeleccionar && serie[activo].periodo !== seleccionado && <p className="mt-1 text-[11px] text-zinc-400">Clic para ver este mes</p>}
        </Tooltip>
      )}
    </div>
  )
}

// ─── Columnas agrupadas de dos series (ITBIS en ventas y en compras) ─────

export function Leyenda({ items }: { items: { nombre: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
      {items.map(i => (
        <li key={i.nombre} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ background: i.color }} />
          {i.nombre}
        </li>
      ))}
    </ul>
  )
}

export function ColumnasPares({ serie, seleccionado, onSeleccionar, series, alto = 128 }: {
  serie: { periodo: string; a: number; b: number }[]
  seleccionado: string
  onSeleccionar?: (periodo: string) => void
  // Nombre y color de cada serie (a = primera columna, b = segunda).
  series: { a: { nombre: string; color: string }; b: { nombre: string; color: string } }
  alto?: number
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [activo, setActivo] = useState<number | null>(null)
  const plotW = Math.max(0, ancho - M.izq - M.der)
  const plotH = alto - 10 - M.abajo
  const marcas = marcasEje(Math.max(0, ...serie.flatMap(p => [p.a, p.b])), 2)
  const tope = marcas[marcas.length - 1] || 1
  const y = (v: number) => 10 + plotH - (Math.max(0, v) / tope) * plotH
  const banda = serie.length ? plotW / serie.length : 0
  const gap = 2
  const barra = Math.min(16, Math.max(3, (banda * 0.6 - gap) / 2))

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setActivo(null)}>
      {ancho > 0 && (
        <svg width={ancho} height={alto} role="group" aria-label={`${series.a.nombre} y ${series.b.nombre} por mes`} className="block overflow-visible">
          <Rejilla marcas={marcas} y={y} ancho={ancho} />
          {serie.map((p, i) => {
            const cx = M.izq + banda * i + banda / 2
            const sel = p.periodo === seleccionado
            const op = sel || activo === i ? 1 : 0.32
            return (
              <g key={p.periodo}>
                <path d={columna(cx - barra - gap / 2, y(p.a), barra, y(0) - y(p.a))} fill={series.a.color} fillOpacity={op} />
                <path d={columna(cx + gap / 2, y(p.b), barra, y(0) - y(p.b))} fill={series.b.color} fillOpacity={op} />
                {rotular(i, serie.length, banda, sel) && (
                  <text x={cx} y={alto - 6} textAnchor="middle" className={cn('text-[10px]', sel ? 'fill-zinc-900 font-semibold dark:fill-zinc-50' : 'fill-zinc-400 dark:fill-zinc-500')}>{mesCorto(p.periodo)}</text>
                )}
                <rect
                  x={M.izq + banda * i} y={0} width={banda} height={alto}
                  fill="transparent" tabIndex={0} role="button"
                  aria-label={`${periodoLargo(p.periodo)}: ${series.a.nombre.toLowerCase()} ${formatRD(p.a)}, ${series.b.nombre.toLowerCase()} ${formatRD(p.b)}`}
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
        <Tooltip ancho={ancho} x={M.izq + banda * activo + banda / 2 + barra} y={0}>
          <p className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{periodoLargo(serie[activo].periodo)}</p>
          <FilaTooltip color={series.a.color} nombre={series.a.nombre} valor={formatRD(serie[activo].a)} />
          <FilaTooltip color={series.b.color} nombre={series.b.nombre} valor={formatRD(serie[activo].b)} />
        </Tooltip>
      )}
    </div>
  )
}

// ─── Línea con área (ventas por mes) ─────────────────────────────────────

export function LineaMes({ serie, seleccionado, onSeleccionar, nombre, color }: {
  serie: PuntoSerie[]
  seleccionado: string
  onSeleccionar?: (periodo: string) => void
  nombre: string
  color: string
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [activo, setActivo] = useState<number | null>(null)
  const plotW = Math.max(0, ancho - M.izq - M.der - 8)
  const plotH = ALTO - M.arriba - M.abajo
  const marcas = marcasEje(Math.max(0, ...serie.map(p => p.valor)), 2)
  const tope = marcas[marcas.length - 1] || 1
  const y = (v: number) => M.arriba + plotH - (Math.max(0, v) / tope) * plotH
  const n = serie.length
  const paso = n > 1 ? plotW / (n - 1) : 0
  const x = (i: number) => M.izq + 4 + (n > 1 ? paso * i : plotW / 2)
  const puntos = serie.map((p, i) => [x(i), y(p.valor)] as const)
  const linea = puntos.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join('')
  const area = n ? `${linea}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : ''
  const iSel = serie.findIndex(p => p.periodo === seleccionado)

  // La línea vertical sigue al cursor y se pega al mes más cercano.
  const mover = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    setActivo(Math.max(0, Math.min(n - 1, n > 1 ? Math.round((px - x(0)) / paso) : 0)))
  }
  const teclado = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      setActivo(a => Math.max(0, Math.min(n - 1, (a ?? iSel) + (e.key === 'ArrowLeft' ? -1 : 1))))
    } else if ((e.key === 'Enter' || e.key === ' ') && activo !== null) {
      e.preventDefault()
      onSeleccionar?.(serie[activo].periodo)
    }
  }

  return (
    <div ref={ref} className="relative">
      {ancho > 0 && (
        <svg
          width={ancho} height={ALTO} role="img" tabIndex={0}
          aria-label={`${nombre} por mes, sin impuestos. Usa las flechas para recorrer los meses.`}
          className="block cursor-crosshair overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#1B2980]/30"
          onPointerMove={mover} onPointerLeave={() => setActivo(null)}
          onFocus={() => setActivo(a => a ?? iSel)} onBlur={() => setActivo(null)} onKeyDown={teclado}
          onClick={() => activo !== null && onSeleccionar?.(serie[activo].periodo)}
        >
          <Rejilla marcas={marcas} y={y} ancho={ancho} />
          <path d={area} fill={color} fillOpacity={0.1} />
          <path d={linea} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {serie.map((p, i) => rotular(i, n, n > 1 ? paso : plotW, i === iSel) && (
            <text key={p.periodo} x={x(i)} y={ALTO - 6} textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'} className={cn('text-[10px]', i === iSel ? 'fill-zinc-900 font-semibold dark:fill-zinc-50' : 'fill-zinc-400 dark:fill-zinc-500')}>{mesCorto(p.periodo)}</text>
          ))}
          {activo !== null && puntos[activo] && (
            <line x1={puntos[activo][0]} x2={puntos[activo][0]} y1={M.arriba - 6} y2={y(0)} className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth={1} shapeRendering="crispEdges" />
          )}
          {/* Punto final (el período elegido) con anillo de 2 px de la superficie. */}
          {iSel >= 0 && (
            <>
              <circle cx={puntos[iSel][0]} cy={puntos[iSel][1]} r={4} fill={color} stroke="var(--c-sup)" strokeWidth={2} />
              {serie[iSel].valor > 0 && activo === null && (
                <text x={puntos[iSel][0]} y={puntos[iSel][1] - 9} textAnchor={iSel === n - 1 && n > 1 ? 'end' : 'middle'} className="fill-zinc-700 text-[10px] font-semibold tabular-nums dark:fill-zinc-200">{montoCompacto(serie[iSel].valor)}</text>
              )}
            </>
          )}
          {activo !== null && activo !== iSel && puntos[activo] && (
            <circle cx={puntos[activo][0]} cy={puntos[activo][1]} r={4} fill={color} stroke="var(--c-sup)" strokeWidth={2} />
          )}
        </svg>
      )}
      {activo !== null && serie[activo] && (
        <Tooltip ancho={ancho} x={x(activo)} y={M.arriba}>
          <p className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{periodoLargo(serie[activo].periodo)}</p>
          <FilaTooltip color={color} nombre={nombre} valor={formatRD(serie[activo].valor)} />
          {onSeleccionar && serie[activo].periodo !== seleccionado && <p className="mt-1 text-[11px] text-zinc-400">Clic para ver este mes</p>}
        </Tooltip>
      )}
    </div>
  )
}

// ─── Dona de la composición de las compras, con leyenda de montos ────────

// Sector de corona entre dos fracciones de la vuelta (0 = arriba, sentido
// horario).
function sector(cx: number, cy: number, rExt: number, rInt: number, a0: number, a1: number): string {
  const p = (r: number, f: number) => {
    const ang = f * 2 * Math.PI - Math.PI / 2
    return `${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`
  }
  const grande = a1 - a0 > 0.5 ? 1 : 0
  return `M${p(rExt, a0)}A${rExt},${rExt} 0 ${grande} 1 ${p(rExt, a1)}L${p(rInt, a1)}A${rInt},${rInt} 0 ${grande} 0 ${p(rInt, a0)}Z`
}

export function DonaComposicion({ partes }: { partes: Composicion[] }) {
  const [activa, setActiva] = useState<number | null>(null)
  const total = partes.reduce((s, p) => s + Math.max(0, p.monto), 0)
  const arcos = arcosDona(partes.map(p => p.monto))
  const pct = (m: number) => (total > 0 ? Math.round((Math.max(0, m) / total) * 100) : 0)
  const T = 124, c = T / 2, rExt = 60, rInt = 41
  const visibles = partes.map((p, i) => ({ p, i })).filter(({ p }) => p.parte !== 'Sin clasificar' || p.cantidad > 0)
  const enfoque = activa !== null ? partes[activa] : null

  return (
    <div className="flex items-center gap-4 sm:gap-5" onMouseLeave={() => setActiva(null)}>
      <div className="relative shrink-0" style={{ width: T, height: T }}>
        <svg width={T} height={T} role="group" aria-label={`Composición de las compras: ${partes.filter(p => p.cantidad > 0).map(p => `${p.parte} ${formatRD(p.monto)}`).join(', ')}`}>
          <circle cx={c} cy={c} r={(rExt + rInt) / 2} fill="none" strokeWidth={rExt - rInt} className="stroke-zinc-100 dark:stroke-[#1a1d2e]" />
          {partes.map((p, i) => {
            const { inicio, fin } = arcos[i]
            if (fin - inicio <= 0) return null
            const completo = fin - inicio > 0.9999
            const d = completo
              ? `${sector(c, c, rExt, rInt, 0, 0.5)}${sector(c, c, rExt, rInt, 0.5, 1)}`
              : sector(c, c, rExt, rInt, inicio, fin)
            return (
              <path
                key={p.parte} d={d} fill={COLOR_PARTE[p.parte]}
                // 2 px de separación en el color de la superficie (1 px por lado).
                stroke={completo ? 'none' : 'var(--c-sup)'} strokeWidth={2} strokeLinejoin="round"
                tabIndex={0} role="img" aria-label={`${p.parte}: ${formatRD(p.monto)}, ${pct(p.monto)}%`}
                className="cursor-default outline-none transition-[filter] focus-visible:brightness-110"
                style={{ filter: activa === i ? 'brightness(1.12)' : undefined, opacity: activa !== null && activa !== i ? 0.45 : 1 }}
                onMouseEnter={() => setActiva(i)} onFocus={() => setActiva(i)} onBlur={() => setActiva(null)}
              />
            )
          })}
        </svg>
        {/* Centro: lo que señala el cursor o el teclado. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {enfoque ? (
            <>
              <span className="text-lg font-bold leading-none text-zinc-900 dark:text-zinc-50">{pct(enfoque.monto)}%</span>
              <span className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">{enfoque.parte}</span>
            </>
          ) : (
            <>
              <span className="text-lg font-bold leading-none text-zinc-900 dark:text-zinc-50">{partes.reduce((s, p) => s + p.cantidad, 0)}</span>
              <span className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">facturas</span>
            </>
          )}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {visibles.map(({ p, i }) => (
          <li
            key={p.parte}
            className={cn('flex items-start justify-between gap-2 rounded-md text-xs transition-opacity', activa !== null && activa !== i && 'opacity-50')}
            onMouseEnter={() => setActiva(i)}
            title={`${p.parte}: ${formatRD(p.monto)} en ${p.cantidad} ${p.cantidad === 1 ? 'factura' : 'facturas'}`}
          >
            <span className="flex min-w-0 items-start gap-2">
              <span aria-hidden="true" className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR_PARTE[p.parte] }} />
              <span className="min-w-0">
                <span className="block truncate font-medium text-zinc-700 dark:text-zinc-200">{p.parte}</span>
                <span className="block truncate text-[11px] text-zinc-400 dark:text-zinc-500">{pct(p.monto)}%</span>
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{montoRDCompacto(p.monto)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Lista con barras horizontales (una barra por fila, mismo máximo) ────

export function BarrasLista({ filas }: { filas: { nombre: string; valor: number; color: string; detalle?: string }[] }) {
  const max = Math.max(0, ...filas.map(f => Math.abs(f.valor)))
  return (
    <ul className="space-y-4">
      {filas.map(f => (
        <li key={f.nombre} title={`${f.nombre}: ${formatRD(f.valor)}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">
              {f.nombre}
              {f.detalle && <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">{f.detalle}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatRD(f.valor, 0)}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100 dark:bg-[#1d2136]">
            <div className="h-1.5 rounded-full" style={{ width: `${max > 0 ? Math.max(1.5, (Math.abs(f.valor) / max) * 100) : 0}%`, background: f.color }} />
          </div>
        </li>
      ))}
    </ul>
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
