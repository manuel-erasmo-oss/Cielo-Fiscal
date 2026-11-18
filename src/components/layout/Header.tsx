'use client'

import Link from 'next/link'
import { ArrowLeftRight } from 'lucide-react'
import { Monograma } from '@/components/ui/Monograma'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useEmpresaOpcional } from '@/lib/datos/empresa-context'
import { formatCedula } from '@/lib/utils'

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  // Dentro de una empresa, su nombre y RNC quedan siempre a la vista (menú
  // lateral en computadora, esta línea en móvil), para que nunca se trabaje
  // en una empresa creyendo que es otra.
  const empresa = useEmpresaOpcional()?.empresa ?? null
  return (
    <header className="shrink-0 border-b border-zinc-200 dark:border-[#252840] bg-white dark:bg-[#141722]">
      {/* En computadora la empresa activa y "Cambiar de empresa" están en el menú
          lateral (una sola vez: pedido del usuario el 2026-11-18). En móvil no
          hay menú lateral, así que aquí va una línea compacta, solo en móvil. */}
      {empresa && (
        <Link href="/" className="flex items-center gap-2 border-b border-zinc-100 px-4 py-1.5 text-xs text-zinc-600 dark:border-[#1d2035] dark:text-zinc-300 md:hidden">
          <Monograma nombre={empresa.razonSocial} clave={empresa.id} tamano="sm" className="h-6 w-6 rounded-md text-[10px]" />
          <span className="min-w-0 truncate font-semibold text-zinc-900 dark:text-zinc-100">{empresa.razonSocial}</span>
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{formatCedula(empresa.rncCedula)}</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-[#1B2980] dark:text-indigo-300">
            <ArrowLeftRight className="h-3.5 w-3.5" /> Cambiar
          </span>
        </Link>
      )}
      <div className="flex h-14 items-center px-4">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <div className="min-w-0 truncate">
            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</span>
            {subtitle && (
              <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400 hidden sm:inline">{subtitle}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
