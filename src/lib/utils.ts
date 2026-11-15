import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Botón primario compartido — copiado literalmente de Cielo Cloud Nómina
// (`src/lib/utils.ts` de manuel-erasmo-oss/tyui) para mantener el mismo
// lenguaje visual entre productos de la suite.
export const BTN_PRIMARY =
  'flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#1B2980] to-[#2f3fa8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-lg hover:shadow-[#1B2980]/25 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm'

// ─── Fechas solo-fecha ("YYYY-MM-DD") ────────────────────────────────────────
// NUNCA `new Date('2026-03-01')`: se interpreta como medianoche UTC y en RD
// (UTC-4, sin horario de verano) cae en la noche del día calendario ANTERIOR
// en cuanto se le pide cualquier componente local. Lección heredada de Cielo
// Cloud Nómina (ver CLAUDE.md). Toda fecha de factura, vencimiento o cierre
// fiscal pasa por estas dos funciones.

const FECHA_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// Convierte "YYYY-MM-DD" en un Date a medianoche LOCAL de ese día calendario.
// Lanza si el string no tiene ese formato o no es una fecha real (ej.
// "2026-02-30") — una fecha fiscal inválida no debe pasar en silencio.
export function parseFechaLocal(iso: string): Date {
  const m = FECHA_ISO_RE.exec(iso)
  if (!m) throw new Error(`Fecha inválida (se esperaba YYYY-MM-DD): "${iso}"`)
  const anio = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  const d = new Date(anio, mes - 1, dia)
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) {
    throw new Error(`Fecha inexistente en el calendario: "${iso}"`)
  }
  return d
}

// Formatea un Date como "YYYY-MM-DD" usando sus componentes LOCALES (nunca
// `toISOString()`, que convierte a UTC y puede saltar de día).
export function fechaLocalISO(d: Date): string {
  const anio = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

// Día calendario de hoy, en hora local, como "YYYY-MM-DD".
export function hoyLocalISO(): string {
  return fechaLocalISO(new Date())
}

// "01 mar de 2026" — acepta solo fechas solo-fecha, vía parseFechaLocal.
export function formatDate(isoDate: string): string {
  return parseFechaLocal(isoDate).toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// "junio 2026"
export function formatPeriodo(anio: number, mes: number): string {
  return new Date(anio, mes - 1, 1).toLocaleDateString('es-DO', {
    month: 'long',
    year: 'numeric',
  })
}

// ─── Números ─────────────────────────────────────────────────────────────────

// Peso dominicano: "RD$1,234.56"
export function formatRD(amount: number, decimals = 2): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

export function formatNum(n: number, decimals = 2): string {
  return new Intl.NumberFormat('es-DO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

// Redondeo a 2 decimales para montos (evita 0.1 + 0.2 = 0.30000000000000004
// al sumar ITBIS de muchas facturas).
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ─── Identificadores ─────────────────────────────────────────────────────────

export function soloDigitos(raw: string): string {
  return raw.replace(/\D/g, '')
}

// Cédula dominicana: 001-1234567-8 (misma función que Cielo Cloud Nómina).
export function formatCedula(raw: string): string {
  const digits = soloDigitos(raw)
  if (digits.length !== 11) return raw
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
}
