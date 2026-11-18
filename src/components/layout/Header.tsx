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
  // Dentro de una empresa, su nombre y RNC quedan siempre a la vista, para
  // que nunca se trabaje en una empresa creyendo que es otra.
  const empresa = useEmpresaOpcional()?.empresa ?? null
  return (
    <header className="shrink-0 border-b border-zinc-200 dark:border-[#252840] bg-white dark:bg-[#141722]">
      {empresa && (
        <div className="flex items-center gap-2.5 border-b border-[#1B2980]/10 bg-gradient-to-r from-[#eef0fb] via-[#f4f5fd] to-[#eef0fb] px-4 py-1.5 text-xs text-[#151f66] dark:border-indigo-900/40 dark:from-indigo-950/50 dark:via-indigo-950/30 dark:to-indigo-950/50 dark:text-indigo-200">
          <Monograma nombre={empresa.razonSocial} clave={empresa.id} tamano="sm" className="h-6 w-6 rounded-md text-[10px]" />
          <span className="min-w-0 truncate">
            <span className="opacity-70">Trabajando en</span> <strong className="font-semibold">{empresa.razonSocial}</strong>
            <span className="ml-1.5 tabular-nums opacity-70">{formatCedula(empresa.rncCedula)}</span>
          </span>
          <Link href="/" className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 font-semibold transition-colors hover:bg-white/70 dark:hover:bg-indigo-900/40">
            <ArrowLeftRight className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Cambiar de empresa</span><span className="sm:hidden">Cambiar</span>
          </Link>
        </div>
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
