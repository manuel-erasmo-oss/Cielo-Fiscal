'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, CONFIGURACION_ITEM } from '@/lib/nav-items'

// Portado de `Sidebar.tsx` de Cielo Cloud Nómina (manuel-erasmo-oss/tyui):
// mismo isotipo, mismo riel colapsable con flyout y mismos estilos. Se
// quitaron el selector de empresa y el perfil/logout porque el MVP no tiene
// cuentas todavía.

export function Sidebar() {
  const pathname  = usePathname()

  const [collapsed, setCollapsed] = useState(false)
  const [mounted,   setMounted]   = useState(false)
  const [hovering,  setHovering]  = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    if (localStorage.getItem('cielo-fiscal-sidebar') === '1') setCollapsed(true)
  }, [])

  useEffect(() => () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
  }, [])

  const toggle = () =>
    setCollapsed(v => {
      localStorage.setItem('cielo-fiscal-sidebar', v ? '0' : '1')
      return !v
    })

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  // Avoid hydration flash — render expanded until client mounts
  const c = mounted && collapsed

  // Mientras está colapsado, posicionar el mouse sobre el riel lo expande
  // temporalmente como un flyout flotante (no empuja el contenido de la
  // página) — al sacar el mouse vuelve a colapsarse, con un pequeño margen
  // para evitar parpadeo si el cursor sale y entra de nuevo muy rápido.
  const flyout = c && hovering
  const wide   = !c || flyout

  function handleMouseEnter() {
    if (!c) return
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null }
    setHovering(true)
  }
  function handleMouseLeave() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(() => setHovering(false), 150)
  }

  return (
    <>
      {/* Espaciador — conserva el ancho colapsado en el layout mientras el
          riel real "flota" encima como flyout, para que el contenido de la
          página no se desplace al pasar el mouse. */}
      {flyout && <div className="hidden md:block h-screen w-[68px] shrink-0" />}

      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'hidden md:flex h-screen flex-col bg-white dark:bg-[#141722]',
          'border-r border-zinc-200 dark:border-[#252840]',
          'transition-[width] duration-200 ease-in-out overflow-hidden',
          flyout
            ? 'fixed left-0 top-0 z-40 w-60 shadow-2xl shadow-zinc-900/10 dark:shadow-black/50'
            : 'relative shrink-0',
          !flyout && (c ? 'w-[68px]' : 'w-60'),
        )}
      >
        {/* ── Logo / Brand ─────────────────────────────────────────── */}
        <div
          className={cn(
            'flex h-[80px] shrink-0 items-center border-b border-zinc-200 dark:border-[#252840]',
            wide ? 'px-5 gap-4' : 'flex-col justify-center gap-2.5 px-0',
          )}
        >
          {/* Isotipo — arco geométrico 300° */}
          <svg
            viewBox="0 0 32 32"
            fill="none"
            aria-label="Cielo Cloud"
            className={cn('shrink-0', wide ? 'h-10 w-10' : 'h-[46px] w-[46px]')}
          >
            {/*
              Arco grueso: círculo r=9, strokeWidth=5.5
              300° de arco · gap=60° con terminaciones redondeadas
              rotate(30°) → apertura centrada al Este (derecha)
              C = 2π×9 ≈ 56.55 · arco300° ≈ 47.12 · gap ≈ 9.43
            */}
            <circle
              cx="16" cy="16" r="9"
              strokeWidth="5.5"
              strokeDasharray="47.12 9.43"
              strokeLinecap="round"
              transform="rotate(30 16 16)"
              className="stroke-[#1B2980] dark:stroke-white"
            />
            {/* Punto interior */}
            <circle cx="16" cy="16" r="2.8" className="fill-[#1B2980] dark:fill-white" />
          </svg>

          {/* Wordmark — visible expandido o en flyout */}
          {wide && (
            <div className="flex flex-col min-w-0 flex-1 gap-[3px]">
              {/* Nombre de marca con contraste de peso */}
              <div className="flex items-baseline gap-[5px]">
                <span className="text-[16px] font-bold tracking-[-0.02em] text-zinc-900 dark:text-white leading-none">
                  Cielo
                </span>
                <span className="text-[16px] font-extralight tracking-[-0.01em] text-zinc-400 dark:text-zinc-300 leading-none">
                  Cloud
                </span>
              </div>
              {/* Descriptor en versalitas espaciadas */}
              <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500 leading-none">
                Fiscal
              </span>
            </div>
          )}

          {/* Toggle — colapsa/expande de forma persistente (independiente del flyout) */}
          <button
            onClick={toggle}
            title={c ? 'Expandir' : 'Colapsar'}
            className={cn(
              'flex items-center justify-center rounded-lg transition-colors shrink-0',
              'text-zinc-300 hover:text-[#1B2980] hover:bg-[#eef0fb]',
              'dark:text-zinc-600 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/30',
              wide ? 'h-6 w-6' : 'h-5 w-5',
            )}
          >
            {c
              ? <ChevronRight className="h-3.5 w-3.5" />
              : <ChevronLeft  className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* ── Navigation ───────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={wide ? undefined : item.label}
                className={cn(
                  'flex items-center py-2.5 text-sm transition-colors border-l-[3px]',
                  wide ? 'gap-3 px-4' : 'justify-center px-0',
                  active
                    ? 'bg-[#eef0fb] dark:bg-indigo-950/40 text-[#1B2980] dark:text-indigo-400 font-semibold border-[#1B2980] dark:border-indigo-500'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1d2e] hover:text-zinc-900 dark:hover:text-zinc-100 border-transparent',
                )}
              >
                <item.icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    active
                      ? 'text-[#1B2980] dark:text-indigo-400'
                      : 'text-zinc-400 dark:text-zinc-600',
                  )}
                />
                {wide && (
                  <>
                    <span className="flex-1 leading-none">{item.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-[#2e3355]" />
                  </>
                )}
              </Link>
            )
          })}
        </nav>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div className="border-t border-zinc-200 dark:border-[#252840] py-1">
          <Link
            href={CONFIGURACION_ITEM.href}
            title={wide ? undefined : CONFIGURACION_ITEM.label}
            className={cn(
              'flex items-center py-2.5 text-sm transition-colors border-l-[3px]',
              wide ? 'gap-3 px-4' : 'justify-center px-0',
              isActive(CONFIGURACION_ITEM.href)
                ? 'bg-[#eef0fb] dark:bg-indigo-950/40 text-[#1B2980] dark:text-indigo-400 font-semibold border-[#1B2980] dark:border-indigo-500'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1a1d2e] hover:text-zinc-900 dark:hover:text-zinc-100 border-transparent',
            )}
          >
            <CONFIGURACION_ITEM.icon
              className={cn(
                'h-4 w-4 shrink-0',
                isActive(CONFIGURACION_ITEM.href)
                  ? 'text-[#1B2980] dark:text-indigo-400'
                  : 'text-zinc-400 dark:text-zinc-600',
              )}
            />
            {wide && (
              <>
                <span className="flex-1">Configuración</span>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-[#2e3355]" />
              </>
            )}
          </Link>

        </div>
      </aside>
    </>
  )
}
