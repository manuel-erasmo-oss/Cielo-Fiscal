'use client'

import Link from 'next/link'
import { ArrowLeftRight, Building2 } from 'lucide-react'
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
        <div className="flex items-center gap-2 border-b border-[#1B2980]/10 bg-[#eef0fb] px-4 py-1.5 text-xs text-[#151f66] dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-200">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            Trabajando en <strong>{empresa.razonSocial}</strong>
            <span className="ml-1.5 tabular-nums opacity-80">{formatCedula(empresa.rncCedula)}</span>
          </span>
          <Link href="/" className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold hover:underline">
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
