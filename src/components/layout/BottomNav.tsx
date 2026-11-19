'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CONFIGURACION_ITEM, NAV_GLOBAL, empresaDeRuta, estaActivo, navEmpresa, type NavItem } from '@/lib/nav-items'

// Móvil: dentro de una empresa, sus módulos (para cambiar de empresa está la
// franja de arriba, una sola vez); fuera, Tus empresas y Ajustes.
export function BottomNav() {
  const pathname = usePathname()
  const empresaId = empresaDeRuta(pathname)
  const items: NavItem[] = empresaId
    ? navEmpresa(empresaId)
    : [...NAV_GLOBAL, { ...CONFIGURACION_ITEM, label: 'Ajustes' }]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center border-t border-zinc-200 dark:border-[#252840] bg-white dark:bg-[#141722] px-1">
      {items.map(item => {
        const active = estaActivo(item, pathname)
        return (
          <Link
            key={item.href + item.label}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors',
              active ? 'text-[#1B2980] dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-600',
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
