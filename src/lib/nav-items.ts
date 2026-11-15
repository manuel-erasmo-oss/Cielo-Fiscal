import { LayoutDashboard, Users, ReceiptText, Settings, type LucideIcon } from 'lucide-react'

export interface NavItem {
  href: string
  icon: LucideIcon
  label: string
}

// Solo lo que ya existe. Los reportes (606, 607, ITBIS, IR-17, ISR) se
// agregan aquí a medida que se construyan — no se listan pantallas vacías.
export const NAV_ITEMS: NavItem[] = [
  { href: '/',         icon: LayoutDashboard, label: 'Inicio' },
  { href: '/clientes', icon: Users,           label: 'Clientes' },
  { href: '/facturas', icon: ReceiptText,     label: 'Facturas' },
]

export const CONFIGURACION_ITEM: NavItem = {
  href: '/configuracion', icon: Settings, label: 'Configuración',
}
