import type { TipoDocumento } from '@/types'

// Desde el 2026-11-18 cada tipo de factura tiene su módulo (pedido por el
// usuario): las ventas en "Ingresos" (reporte de ingresos) y las compras en
// "Costos y gastos" (Formato 606).
export interface Modulo {
  nombre: string
  seccion: 'ingresos' | 'costos-gastos'
  // "compras" / "ventas", para frases como "3 eran ventas".
  plural: string
  // Quién es la otra parte de la factura.
  contraparte: string
  contrapartes: string
}

export const MODULO_DE: Record<TipoDocumento, Modulo> = {
  compra: { nombre: 'Costos y gastos', seccion: 'costos-gastos', plural: 'compras', contraparte: 'Proveedor', contrapartes: 'Proveedores' },
  venta: { nombre: 'Ingresos', seccion: 'ingresos', plural: 'ventas', contraparte: 'Cliente', contrapartes: 'Clientes' },
}
