import { Header } from './Header'

// Estructura común de toda pantalla: encabezado fijo + contenido con scroll.
export function Pagina({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <Header title={title} subtitle={subtitle} actions={actions} />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-zinc-50 dark:bg-[#0d0f1a]">
        {children}
      </main>
    </>
  )
}

// Aviso cuando el almacenamiento del navegador no se pudo leer.
export function AvisoErrorCarga({ mensaje }: { mensaje: string }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-5 py-4 text-sm text-rose-700 dark:text-rose-300">
      <p className="font-semibold">No se pudieron leer tus datos</p>
      <p className="mt-1">{mensaje}</p>
    </div>
  )
}
