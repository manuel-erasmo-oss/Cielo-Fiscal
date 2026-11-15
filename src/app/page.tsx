// Página placeholder del scaffold. Se reemplaza por el dashboard real cuando
// existan Auth + ClienteFiscal (paso 1 del roadmap en CLAUDE.md).

const ROADMAP = [
  'Auth y clientes',
  'Subida de facturas y extracción OCR',
  'Reporte 606 (compras)',
  'Reporte 607 (ventas)',
  'Declaración ITBIS mensual (IT-1)',
  'IR-17',
  'Proyección de ISR',
]

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-auth-card-in rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-[#252840] dark:bg-[#151829]">
        <div className="flex items-center gap-4">
          {/* Isotipo — copiado literalmente de Sidebar.tsx de Cielo Cloud Nómina */}
          <svg
            viewBox="0 0 32 32"
            fill="none"
            aria-label="Cielo Cloud"
            className="h-10 w-10 shrink-0"
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
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Cielo Cloud Fiscal
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Gestión fiscal para contadores
            </p>
          </div>
        </div>

        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-300">
          Base del proyecto lista. Todavía no hay funcionalidad: esto es lo que
          se construye a continuación, en este orden.
        </p>

        <ol className="mt-4 space-y-2">
          {ROADMAP.map((paso, i) => (
            <li key={paso} className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cielo-50 text-xs font-semibold text-cielo-navy dark:bg-[#252840] dark:text-zinc-100">
                {i + 1}
              </span>
              {paso}
            </li>
          ))}
        </ol>
      </div>
    </main>
  )
}
