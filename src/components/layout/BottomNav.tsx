'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, CONFIGURACION_ITEM } from '@/lib/nav-items'

const ITEMS = [...NAV_ITEMS, { ...CONFIGURACION_ITEM, label: 'Ajustes' }]

export function BottomNav() {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center border-t border-zinc-200 dark:border-[#252840] bg-white dark:bg-[#141722] px-1">
      {ITEMS.map(item => {
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
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
