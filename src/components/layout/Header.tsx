import { ThemeToggle } from '@/components/ui/ThemeToggle'

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-zinc-200 dark:border-[#252840] bg-white dark:bg-[#141722] px-4">
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
    </header>
  )
}
