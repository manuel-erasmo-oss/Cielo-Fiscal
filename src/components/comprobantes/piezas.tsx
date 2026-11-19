'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, FileText, Files,
  MoreVertical, Pencil, Plus, ShieldAlert, ShieldCheck, ShieldX, Trash2, type LucideIcon,
} from 'lucide-react'
import { Estado } from '@/components/ui/premium'
import { TH_CLASS } from '@/components/ui/clases'
import { ESTADOS_FILA, ETIQUETA_ESTADO_FILA, estadoDeFila, type Direccion, type EstadoFila, type Pagina } from '@/lib/comprobantes'
import { TIPO_BIENES_SERVICIOS_606, clasificacionContable } from '@/lib/dgii-formatos'
import { ETIQUETA_ESTADO_DGII } from '@/lib/verificacion-dgii'
import { BTN_PRIMARY, cn, formatRD } from '@/lib/utils'
import type { DocumentoFiscal } from '@/types'

// Piezas de los módulos Ingresos y Costos y gastos (estilo de los ERP
// contables: barra de dinero, tabla con selección, orden y paginación).

// ─── Estado ──────────────────────────────────────────────────────────────────

export const ESTILO_ESTADO: Record<EstadoFila, { tono: 'aviso' | 'serio' | 'critico' | 'bien'; icono: LucideIcon; barra: string; texto: string }> = {
  por_revisar: { tono: 'aviso', icono: CircleAlert, barra: 'bg-amber-400 dark:bg-amber-400', texto: 'text-amber-700 dark:text-amber-300' },
  verificar: { tono: 'serio', icono: ShieldAlert, barra: 'bg-orange-500 dark:bg-orange-400', texto: 'text-orange-700 dark:text-orange-300' },
  rechazada: { tono: 'critico', icono: ShieldX, barra: 'bg-rose-500 dark:bg-rose-400', texto: 'text-rose-700 dark:text-rose-300' },
  revisada: { tono: 'bien', icono: CheckCircle2, barra: 'bg-emerald-500 dark:bg-emerald-400', texto: 'text-emerald-700 dark:text-emerald-300' },
}

// Un solo estado por factura, el más grave (la tabla no se ensancha).
export function EstadoFactura({ d }: { d: DocumentoFiscal }) {
  const e = estadoDeFila(d)
  const { tono, icono } = ESTILO_ESTADO[e]
  const aceptada = d.verificacionDGII && ['aceptado', 'aceptado_condicional'].includes(d.verificacionDGII.estado)
  return (
    <div className="flex items-center gap-1.5">
      {e === 'rechazada'
        ? <span title={ETIQUETA_ESTADO_DGII[d.verificacionDGII!.estado]}><Estado tono={tono} icono={icono}>{d.verificacionDGII!.estado === 'rechazado' ? 'Rechazada' : 'No existe en la DGII'}</Estado></span>
        : e === 'verificar'
          ? <span title="No se pudo verificar en la DGII: verifícala a mano antes de aprobarla."><Estado tono={tono} icono={icono}>Verificar en la DGII</Estado></span>
          : <Estado tono={tono} icono={icono}>{e === 'revisada' ? 'Revisada' : 'Por revisar'}</Estado>}
      {aceptada && (
        <span title={`${ETIQUETA_ESTADO_DGII[d.verificacionDGII!.estado]} · ${new Date(d.verificacionDGII!.consultadoEn).toLocaleString('es-DO')}`}>
          <ShieldCheck aria-label={ETIQUETA_ESTADO_DGII[d.verificacionDGII!.estado]} className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </span>
      )}
    </div>
  )
}

// ─── Barra de dinero ─────────────────────────────────────────────────────────

// Franja con el total de cada estado; tocar un bloque filtra por ese estado.
export function BarraDinero({ resumen, activo, onElegir }: {
  resumen: Record<EstadoFila, { cantidad: number; total: number }>
  activo: EstadoFila | ''
  onElegir: (estado: EstadoFila | '') => void
}) {
  const cantidad = ESTADOS_FILA.reduce((s, e) => s + resumen[e].cantidad, 0)
  return (
    <section aria-label="Resumen por estado" className="animate-content-in overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-[#252840] dark:bg-[#141722] dark:shadow-none">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {ESTADOS_FILA.map((e, i) => {
          const { icono: Icono, barra, texto } = ESTILO_ESTADO[e]
          const r = resumen[e]
          const elegido = activo === e
          const pct = cantidad ? (r.cantidad / cantidad) * 100 : 0
          return (
            <button
              key={e}
              type="button"
              aria-pressed={elegido}
              onClick={() => onElegir(elegido ? '' : e)}
              className={cn(
                'group relative flex min-w-0 flex-col gap-1 px-4 pb-4 pt-3.5 text-left transition-colors sm:px-5',
                'border-zinc-100 dark:border-[#1d2035]',
                i % 2 === 1 && 'border-l', i >= 2 && 'border-t lg:border-t-0', i === 2 && 'lg:border-l',
                elegido ? 'bg-[#f4f5fd] dark:bg-indigo-950/30' : 'hover:bg-zinc-50/80 dark:hover:bg-[#171a2a]',
              )}
            >
              <span className={cn('flex items-center gap-1.5 text-xs font-semibold', texto)}>
                <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{ETIQUETA_ESTADO_FILA[e]}</span>
              </span>
              <span className="truncate text-lg font-semibold tracking-[-0.02em] tabular-nums text-zinc-900 dark:text-zinc-50 sm:text-xl">{formatRD(r.total, 0)}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                <span className="tabular-nums">{r.cantidad}</span> {r.cantidad === 1 ? 'factura' : 'facturas'}
                {elegido && <span className="ml-1 font-medium text-[#1B2980] dark:text-indigo-300">· filtrando</span>}
              </span>
              <span className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-[#1d2035]">
                <span className={cn('block h-full rounded-full transition-[width] duration-500', barra)} style={{ width: `${pct}%` }} />
              </span>
              {elegido && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-[#1B2980] dark:bg-indigo-400" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ─── Clasificación contable ──────────────────────────────────────────────────

const TONO_CLASIFICACION = {
  Costo: 'bg-teal-50 text-[#0b7d6c] ring-teal-600/20 dark:bg-teal-950/40 dark:text-[#3cc2a8] dark:ring-teal-400/20',
  Gasto: 'bg-[#eef0fb] text-[#3446c4] ring-[#3446c4]/20 dark:bg-indigo-950/40 dark:text-[#8b98f3] dark:ring-indigo-400/20',
  Activo: 'bg-orange-50 text-[#b14d0c] ring-orange-600/20 dark:bg-orange-950/40 dark:text-[#ec8a52] dark:ring-orange-400/20',
} as const

export function PildoraClasificacion({ tipoBienes }: { tipoBienes: string | null }) {
  const c = clasificacionContable(tipoBienes)
  if (!c) return <span className="text-xs text-zinc-400 dark:text-zinc-500">Sin clasificar</span>
  const nombre = TIPO_BIENES_SERVICIOS_606.find(o => o.codigo === tipoBienes)?.nombre
  return (
    <span title={nombre ? `${tipoBienes} · ${nombre}` : undefined} className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONO_CLASIFICACION[c])}>
      {c}
    </span>
  )
}

// ─── Tabla ───────────────────────────────────────────────────────────────────

export function Casilla({ marcada, mixta = false, onCambio, etiqueta }: { marcada: boolean; mixta?: boolean; onCambio: () => void; etiqueta: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixta && !marcada }, [mixta, marcada])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={marcada}
      onChange={onCambio}
      onClick={e => e.stopPropagation()}
      aria-label={etiqueta}
      className="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-[#1B2980] dark:accent-indigo-500"
    />
  )
}

// Encabezado que ordena la tabla: indica la dirección y se anuncia con aria-sort.
export function ThOrden({ children, activo, dir, onClick, alinear = 'left', className }: {
  children: ReactNode
  activo: boolean
  dir: Direccion
  onClick: () => void
  alinear?: 'left' | 'right'
  className?: string
}) {
  const Icono = !activo ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th aria-sort={activo ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn(TH_CLASS, alinear === 'right' ? 'text-right' : 'text-left', className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn('group/orden inline-flex items-center gap-1 uppercase tracking-[0.1em] transition-colors hover:text-zinc-900 dark:hover:text-zinc-100', activo && 'text-[#1B2980] dark:text-indigo-300', alinear === 'right' && 'flex-row-reverse')}
      >
        {children}
        <Icono className={cn('h-3 w-3', !activo && 'opacity-40 group-hover/orden:opacity-100')} aria-hidden="true" />
      </button>
    </th>
  )
}

export function Paginacion({ pagina, onIr, sustantivo }: { pagina: Pagina<unknown>; onIr: (p: number) => void; sustantivo: [string, string] }) {
  const boton = 'inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#252840] dark:bg-[#141722] dark:text-zinc-300 dark:hover:bg-[#1a1d2e]'
  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500 dark:border-[#1d2035] dark:text-zinc-400 sm:px-5">
      <p className="tabular-nums">
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{pagina.desde}–{pagina.hasta}</span> de {pagina.total} {pagina.total === 1 ? sustantivo[0] : sustantivo[1]}
      </p>
      {pagina.totalPaginas > 1 && (
        <div className="flex items-center gap-1.5">
          <button type="button" className={boton} disabled={pagina.pagina <= 1} onClick={() => onIr(pagina.pagina - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" /> Anterior
          </button>
          <span className="px-1.5 tabular-nums">Página {pagina.pagina} de {pagina.totalPaginas}</span>
          <button type="button" className={boton} disabled={pagina.pagina >= pagina.totalPaginas} onClick={() => onIr(pagina.pagina + 1)}>
            Siguiente <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </nav>
  )
}

// Menú ⋮ de una fila. Se dibuja sobre la página (portal) para que la tabla,
// que puede desplazarse, no lo recorte.
export function MenuFila({ etiqueta, onEditar, onEliminar }: { etiqueta: string; onEditar: () => void; onEliminar: () => void }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!pos) return
    const cerrar = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
      if (e.type === 'mousedown' && (menu.current?.contains(e.target as Node) || boton.current?.contains(e.target as Node))) return
      setPos(null)
    }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', cerrar)
    window.addEventListener('resize', cerrar)
    document.addEventListener('scroll', cerrar, true)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', cerrar)
      window.removeEventListener('resize', cerrar)
      document.removeEventListener('scroll', cerrar, true)
    }
  }, [pos])

  function abrir(e: React.MouseEvent) {
    e.stopPropagation()
    if (pos) { setPos(null); return }
    const r = boton.current!.getBoundingClientRect()
    // Hacia arriba si no cabe debajo.
    const top = r.bottom + 96 > window.innerHeight ? r.top - 92 : r.bottom + 4
    setPos({ top, right: window.innerWidth - r.right })
  }
  const item = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors'
  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={abrir}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        aria-label={`Acciones de ${etiqueta}`}
        className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-[#1d2035] dark:hover:text-zinc-200"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {pos && createPortal(
        <div ref={menu} role="menu" style={{ top: pos.top, right: pos.right }} onClick={e => e.stopPropagation()} className="animate-modal-in fixed z-50 w-44 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-[#252840] dark:bg-[#141722]">
          <button role="menuitem" type="button" onClick={() => { setPos(null); onEditar() }} className={cn(item, 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-[#1a1d2e]')}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
          <button role="menuitem" type="button" onClick={() => { setPos(null); onEliminar() }} className={cn(item, 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30')}>
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Agregar facturas ────────────────────────────────────────────────────────

// Un solo botón para agregar facturas (pedido por el usuario el 2026-11-18:
// "subir lote se repite demasiadas veces"). Subir lote vive aquí, no en el
// menú ni en el dashboard.
export function AgregarFacturas({ hrefLote, onUna }: { hrefLote: string; onUna: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape) }
  }, [abierto])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAbierto(a => !a)} aria-haspopup="menu" aria-expanded={abierto} className={BTN_PRIMARY}>
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Agregar facturas</span>
        <span className="sm:hidden">Agregar</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div role="menu" className="animate-modal-in absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-[#252840] dark:bg-[#141722]">
          <button role="menuitem" onClick={() => { setAbierto(false); onUna() }} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-[#1a1d2e]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300"><FileText className="h-4 w-4" /></span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">Una factura</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">Foto o PDF de una factura, o a mano</span>
            </span>
          </button>
          <Link role="menuitem" href={hrefLote} onClick={() => setAbierto(false)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-[#1a1d2e]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef0fb] text-[#1B2980] dark:bg-indigo-950/50 dark:text-indigo-300"><Files className="h-4 w-4" /></span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">Un lote (PDF o varias fotos)</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">La IA lee todas las páginas por ti</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  )
}
