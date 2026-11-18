import { iniciales } from '@/lib/monograma'
import { cn } from '@/lib/utils'

// Iniciales de una empresa en un círculo con un color propio y estable (el
// mismo nombre da siempre el mismo color). Sirve para reconocer de un
// vistazo en qué empresa se está, sin depender solo de leer el nombre.

// Tonos sobrios alrededor del azul de la marca; ninguno compite con el verde.
const TONOS = [
  'bg-[#eef0fb] text-[#1B2980] ring-[#1B2980]/15 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-400/20',
  'bg-sky-50 text-sky-700 ring-sky-700/15 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-400/20',
  'bg-teal-50 text-teal-700 ring-teal-700/15 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-400/20',
  'bg-violet-50 text-violet-700 ring-violet-700/15 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-400/20',
  'bg-slate-100 text-slate-700 ring-slate-700/15 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-slate-400/20',
  'bg-amber-50 text-amber-800 ring-amber-700/15 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20',
]

function tono(clave: string): string {
  let h = 0
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) >>> 0
  return TONOS[h % TONOS.length]
}

const TAMANOS = {
  sm: 'h-7 w-7 text-[11px] rounded-lg',
  md: 'h-10 w-10 text-sm rounded-xl',
  lg: 'h-14 w-14 text-lg rounded-2xl',
}

export function Monograma({ nombre, clave, tamano = 'md', className }: {
  nombre: string
  // Lo que fija el color (el id de la empresa); si falta, el nombre.
  clave?: string
  tamano?: keyof typeof TAMANOS
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-semibold tracking-tight ring-1 ring-inset',
        TAMANOS[tamano],
        tono(clave ?? nombre),
        className,
      )}
    >
      {iniciales(nombre)}
    </span>
  )
}
