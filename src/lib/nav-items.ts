import { Building2, FileText, LayoutDashboard, Receipt, Settings, TrendingUp, type LucideIcon } from 'lucide-react'
import { rutaEmpresa } from '@/lib/rutas'

export interface NavItem {
  href: string
  icon: LucideIcon
  label: string
  // true si solo se marca activo con la ruta exacta (p. ej. el dashboard).
  exacto?: boolean
  // Otras rutas que también lo marcan activo.
  activoEn?: string[]
}

// Fuera de una empresa solo se puede elegir empresa (o configurar). Los
// módulos de trabajo existen únicamente dentro de una empresa, para que no se
// mezclen datos entre empresas (pedido por el usuario el 2026-11-18).
export const NAV_GLOBAL: NavItem[] = [
  { href: '/', icon: Building2, label: 'Tus empresas', exacto: true },
]

// Solo lo que ya existe. ITBIS, IR-17 e ISR se agregan aquí a medida que se
// construyan — no se listan pantallas vacías. Cada opción aparece una sola
// vez en la aplicación (pedido por el usuario el 2026-11-18): Subir lote no
// es un módulo aparte, se entra desde "Agregar facturas" de Ingresos o de
// Costos y gastos (su ruta, /ingresos/lote o /costos-gastos/lote, cuelga del
// módulo y lo deja marcado por prefijo).
export function navEmpresa(empresaId: string): NavItem[] {
  return [
    { href: rutaEmpresa(empresaId), icon: LayoutDashboard, label: 'Dashboard', exacto: true },
    { href: rutaEmpresa(empresaId, 'ingresos'), icon: TrendingUp, label: 'Ingresos' },
    { href: rutaEmpresa(empresaId, 'costos-gastos'), icon: Receipt, label: 'Costos y gastos' },
    { href: rutaEmpresa(empresaId, 'reportes'), icon: FileText, label: 'Reportes' },
  ]
}

export const CONFIGURACION_ITEM: NavItem = {
  href: '/configuracion', icon: Settings, label: 'Configuración',
}

// Id de la empresa de la ruta actual (/empresa/<id>/...), o null.
export function empresaDeRuta(pathname: string): string | null {
  const m = /^\/empresa\/([^/]+)/.exec(pathname)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}

export function estaActivo(item: NavItem, pathname: string): boolean {
  const coincide = (href: string) => pathname === href || pathname.startsWith(href + '/')
  if (item.activoEn?.some(coincide)) return true
  return item.exacto ? pathname === item.href : coincide(item.href)
}
